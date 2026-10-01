// supabase/functions/crear-solicitud-publicacion/index.ts
//
// Implementa los pasos [5] a [11] de la Secuencia completa de una
// publicación (§29 del documento de arquitectura):
//
//   [5]  Construye Canonical Property (a partir de `propiedades`)
//   [6]  Aplica Public Projection (mapea a contenido por canal)
//   [7]  Valida campos requeridos (§24 — no ejecutar el Worker si falta algo)
//   [8]  Genera contenido (TEMPLATE en este MVP, sin IA todavía)
//   [9]  Prepara assets (referencia a fotos ya subidas a R2)
//   [10] Crea la Solicitud de Publicación + N subjobs (uno por canal)
//   [11] Los subjobs válidos entran en estado QUEUED
//
// Los subjobs con campos faltantes se crean igual, mas en estado
// VALIDATION_ERROR con el detalle de qué falta — nunca se envían al
// Worker. Esto es intencional: el asesor ve en el CRM cuál canal falló
// y por qué, sin perder los que sí pasaron.
//
// Seguridad: las lecturas (propiedad, cuenta social) se hacen con el
// cliente "de usuario" (JWT del caller) para heredar RLS tal cual las
// ve ese usuario. Las escrituras a trabajos_publicacion / contenido /
// assets se hacen con el cliente de service_role porque esas tablas no
// tienen policy de INSERT para usuarios autenticados (solo el motor
// las crea) — ver migración 20260924120000.

import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Máximo de fotos que acepta el formulario móvil de Facebook Marketplace
// (confirmado por Carlos: 10). Hoy Marketplace es el único canal con
// automatización de navegador; si otro canal tuviera un tope distinto,
// mover este valor a la definición del canal/superficie.
const MAX_FOTOS_MARKETPLACE = 10;

// Tope técnico anti-abuso para el texto que envía el cliente. NO es el
// límite de Facebook (se desconoce); solo evita cuerpos desproporcionados.
const MAX_DESCRIPCION_CHARS = 10000;

// Facebook Marketplace solo acepta precios en quetzales. Las propiedades en
// USD se publican como precio * TIPO_CAMBIO_USD_GTQ (decisión de Carlos).
const TIPO_CAMBIO_USD_GTQ = 7.8;

// Límites reales (maxlength) del formulario móvil de Marketplace, medidos en
// el HTML capturado. El Worker también los valida y rechaza sin truncar.
const MAX_TITULO_MARKETPLACE = 100;
const MAX_DESCRIPCION_MARKETPLACE = 2000;

type CanalSolicitado = {
  canal_codigo: string;
  cuenta_social_id?: string | null;
};

type BodyEntrada = {
  propiedad_id: string;
  canales: CanalSolicitado[];
  descripcion_marketplace?: string | null;
};

type ResultadoSubjob = {
  canal_codigo: string;
  trabajo_id: string;
  estado: string;
  mensaje_error?: string;
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return jsonError("Método no permitido", 405);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonError("Falta encabezado Authorization", 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Cliente "como el usuario": respeta RLS tal cual la ve el caller.
    const clienteUsuario = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Cliente de motor: para las tablas que solo el sistema escribe.
    const clienteMotor = createClient(supabaseUrl, serviceKey);

    const { data: userData, error: userError } = await clienteUsuario.auth.getUser();
    if (userError || !userData?.user) {
      return jsonError("Token inválido o expirado", 401);
    }
    const usuarioId = userData.user.id;

    const body = (await req.json()) as BodyEntrada;
    if (!body?.propiedad_id || !Array.isArray(body.canales) || body.canales.length === 0) {
      return jsonError("Body inválido: se requiere propiedad_id y canales[]", 400);
    }

    const textoDescripcion =
      typeof body.descripcion_marketplace === "string" ? body.descripcion_marketplace.trim() : "";
    if (textoDescripcion.length > MAX_DESCRIPCION_CHARS) {
      return jsonError(`descripcion_marketplace excede ${MAX_DESCRIPCION_CHARS} caracteres`, 400);
    }

    // ---------------------------------------------------------------
    // Perfil del asesor (para organization_id)
    // ---------------------------------------------------------------
    const { data: perfil, error: perfilError } = await clienteUsuario
      .from("perfiles")
      .select("id, organization_id, rol")
      .eq("id", usuarioId)
      .single();

    if (perfilError || !perfil) {
      return jsonError("No se encontró perfil del usuario", 403);
    }

    // ---------------------------------------------------------------
    // [5] Canonical Property: la propiedad, vista con RLS del usuario.
    // Si no puede verla, la propia consulta ya regresa null.
    // ---------------------------------------------------------------
    const { data: propiedad, error: propiedadError } = await clienteUsuario
      .from("propiedades")
      .select(
        "id, organization_id, titulo, tipo_operacion, tipo_propiedad, precio, moneda, zona, ciudad, municipio_id, descripcion, dormitorios, banos, parqueos, area_construccion_m2, area_terreno_m2, publicable, captado_por"
      )
      .eq("id", body.propiedad_id)
      .single();

    if (propiedadError || !propiedad) {
      return jsonError("Propiedad no encontrada o sin permiso para verla", 404);
    }

    if (propiedad.organization_id !== perfil.organization_id) {
      return jsonError("La propiedad no pertenece a tu organización", 403);
    }

    if (propiedad.publicable === false) {
      return jsonError("La propiedad está marcada como no publicable", 422);
    }

    // Fotos de la propiedad (para validación de "fotos" y para los assets)
    const { data: imagenes } = await clienteUsuario
      .from("imagenes_propiedad")
      .select("id, ruta_almacenamiento, orden, es_portada")
      .eq("propiedad_id", propiedad.id)
      .order("orden", { ascending: true });

    // ---------------------------------------------------------------
    // [10] Crea la Solicitud de Publicación (padre)
    // ---------------------------------------------------------------
    const { data: solicitud, error: solicitudError } = await clienteMotor
      .from("solicitudes_publicacion")
      .insert({
        organization_id: propiedad.organization_id,
        propiedad_id: propiedad.id,
        asesor_id: usuarioId,
        estado: "PENDIENTE",
      })
      .select("id, trace_id")
      .single();

    if (solicitudError || !solicitud) {
      console.error(solicitudError);
      return jsonError("No se pudo crear la solicitud de publicación", 500);
    }

    await clienteMotor.from("logs_publicacion").insert({
      solicitud_id: solicitud.id,
      tipo_evento: "SOLICITUD_CREATED",
      detalle: { propiedad_id: propiedad.id, asesor_id: usuarioId, canales: body.canales.map((c) => c.canal_codigo) },
    });

    const resultados: ResultadoSubjob[] = [];

    // ---------------------------------------------------------------
    // Fan-out: un subjob por canal solicitado
    // ---------------------------------------------------------------
    for (const solicitado of body.canales) {
      const resultado = await procesarCanal({
        clienteUsuario,
        clienteMotor,
        solicitudId: solicitud.id,
        propiedad,
        imagenes: imagenes ?? [],
        asesorId: usuarioId,
        canalCodigo: solicitado.canal_codigo,
        cuentaSocialId: solicitado.cuenta_social_id ?? null,
        textoDescripcion: textoDescripcion || null,
      });
      resultados.push(resultado);
    }

    return new Response(
      JSON.stringify({
        solicitud_id: solicitud.id,
        trace_id: solicitud.trace_id,
        subjobs: resultados,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (err) {
    console.error(err);
    return jsonError(`Error inesperado: ${(err as Error).message}`, 500);
  }
});

// =====================================================================
// Procesa UN canal solicitado: valida, genera contenido, prepara
// assets, y crea el subjob (trabajos_publicacion) en el estado que
// corresponda. Nunca lanza — cualquier fallo de este canal específico
// se refleja en el subjob, no interrumpe a los demás canales.
// =====================================================================
async function procesarCanal(args: {
  clienteUsuario: SupabaseClient;
  clienteMotor: SupabaseClient;
  solicitudId: string;
  propiedad: any;
  imagenes: any[];
  asesorId: string;
  canalCodigo: string;
  cuentaSocialId: string | null;
  textoDescripcion: string | null;
}): Promise<ResultadoSubjob> {
  const { clienteUsuario, clienteMotor, solicitudId, propiedad, imagenes, asesorId, canalCodigo, cuentaSocialId, textoDescripcion } = args;

  // --- Canal ---
  const { data: canal } = await clienteUsuario
    .from("canales_publicacion")
    .select("id, codigo, nombre, plataforma, metodo_ejecucion, requiere_cuenta_social, requiere_categoria, activo")
    .eq("codigo", canalCodigo)
    .single();

  if (!canal || !canal.activo) {
    return await crearSubjobFallido({
      clienteMotor,
      solicitudId,
      propiedad,
      asesorId,
      canalId: canal?.id ?? null,
      canalCodigo,
      superficieId: null,
      cuentaSocialId: null,
      versionAdapter: null,
      mensaje: `El canal "${canalCodigo}" no existe o no está activo todavía.`,
    });
  }

  // --- Superficie activa del canal ---
  const { data: superficie } = await clienteUsuario
    .from("superficies_canal")
    .select("id, codigo, activa, version_adapter_actual")
    .eq("canal_id", canal.id)
    .eq("activa", true)
    .limit(1)
    .maybeSingle();

  if (canal.metodo_ejecucion === "browser_automation" && !superficie) {
    return await crearSubjobFallido({
      clienteMotor,
      solicitudId,
      propiedad,
      asesorId,
      canalId: canal.id,
      canalCodigo,
      superficieId: null,
      cuentaSocialId: null,
      versionAdapter: null,
      mensaje: `El canal "${canalCodigo}" no tiene ninguna superficie activa configurada.`,
    });
  }

  // --- Cuenta social (si el canal la requiere) ---
  let cuenta: any = null;
  if (canal.requiere_cuenta_social) {
    if (!cuentaSocialId) {
      return await crearSubjobFallido({
        clienteMotor,
        solicitudId,
        propiedad,
        asesorId,
        canalId: canal.id,
        canalCodigo,
        superficieId: superficie?.id ?? null,
        cuentaSocialId: null,
        versionAdapter: superficie?.version_adapter_actual ?? null,
        mensaje: `El canal "${canalCodigo}" requiere una cuenta social y no se envió ninguna.`,
      });
    }

    const { data: cuentaData } = await clienteUsuario
      .from("cuentas_sociales")
      .select("id, organization_id, plataforma, estado")
      .eq("id", cuentaSocialId)
      .single();

    cuenta = cuentaData;

    if (!cuenta || cuenta.organization_id !== propiedad.organization_id) {
      return await crearSubjobFallido({
        clienteMotor,
        solicitudId,
        propiedad,
        asesorId,
        canalId: canal.id,
        canalCodigo,
        superficieId: superficie?.id ?? null,
        cuentaSocialId: null,
        versionAdapter: superficie?.version_adapter_actual ?? null,
        mensaje: "La cuenta social indicada no existe o no pertenece a tu organización.",
      });
    }

    if (cuenta.plataforma !== canal.plataforma) {
      return await crearSubjobFallido({
        clienteMotor,
        solicitudId,
        propiedad,
        asesorId,
        canalId: canal.id,
        canalCodigo,
        superficieId: superficie?.id ?? null,
        cuentaSocialId: cuenta.id,
        versionAdapter: superficie?.version_adapter_actual ?? null,
        mensaje: `La cuenta es de plataforma "${cuenta.plataforma}" pero el canal "${canalCodigo}" requiere "${canal.plataforma}".`,
      });
    }

    if (cuenta.estado !== "READY") {
      return await crearSubjobFallido({
        clienteMotor,
        solicitudId,
        propiedad,
        asesorId,
        canalId: canal.id,
        canalCodigo,
        superficieId: superficie?.id ?? null,
        cuentaSocialId: cuenta.id,
        versionAdapter: superficie?.version_adapter_actual ?? null,
        mensaje: `La cuenta social no está lista (estado actual: ${cuenta.estado}). Debe reautenticarse antes de publicar.`,
        estado: cuenta.estado === "AUTH_REQUIRED" ? "AUTH_REQUIRED" : "VALIDATION_ERROR",
      });
    }
  }

  // ---------------------------------------------------------------
  // [7] Validación previa al Worker (§24) — categoría + campos requeridos
  // ---------------------------------------------------------------
  // ---------------------------------------------------------------
  // [7a] Anti-duplicados: no se crea otro envío si ya hay uno vivo o publicado
  // para la misma propiedad, canal y cuenta. NEEDS_REVIEW cuenta como vivo
  // porque puede significar que se pulsó Publicar sin confirmar el resultado.
  // ---------------------------------------------------------------
  {
    const ESTADOS_BLOQUEANTES = [
      "QUEUED", "PUBLICANDO", "WAITING_APPROVAL", "APPROVED", "VERIFICANDO", "PUBLICADO", "NEEDS_REVIEW",
    ];
    let consultaPrevios = clienteMotor
      .from("trabajos_publicacion")
      .select("id, estado, creado_en")
      .eq("propiedad_id", propiedad.id)
      .eq("canal_id", canal.id)
      .in("estado", ESTADOS_BLOQUEANTES);
    consultaPrevios = cuenta?.id
      ? consultaPrevios.eq("cuenta_social_id", cuenta.id)
      : consultaPrevios.is("cuenta_social_id", null);
    const { data: previos, error: errorPrevios } = await consultaPrevios
      .order("creado_en", { ascending: false })
      .limit(1);

    let mensajeBloqueo: string | null = null;
    if (errorPrevios) {
      console.error(errorPrevios);
      mensajeBloqueo = "No se pudo comprobar si esta propiedad ya tiene un envío en curso, así que no se creó otro por seguridad. Intenta de nuevo.";
    } else if (previos && previos.length > 0) {
      const previo = previos[0];
      const detalles: Record<string, string> = {
        PUBLICADO: "ya está publicada en este canal con esta cuenta. Si quieres republicarla, retira antes el anuncio en Facebook y avisa a un administrador",
        NEEDS_REVIEW: "tiene un envío que requiere revisión (puede que ya se haya publicado). Revisa Facebook antes de crear otro",
      };
      mensajeBloqueo = `Esta propiedad ${
        detalles[previo.estado] ?? `ya tiene un envío en curso (estado ${previo.estado}). Espera a que termine o recházalo`
      }.`;
    }

    if (mensajeBloqueo) {
      return await crearSubjobFallido({
        clienteMotor,
        solicitudId,
        propiedad,
        asesorId,
        canalId: canal.id,
        canalCodigo,
        superficieId: superficie?.id ?? null,
        cuentaSocialId: cuenta?.id ?? null,
        versionAdapter: superficie?.version_adapter_actual ?? null,
        mensaje: mensajeBloqueo,
      });
    }
  }

  let categoriaMatch: { ruta_categoria: string; categoria_externa_id: string | null } | null = null;
  if (canal.requiere_categoria && superficie) {
    const { data: mapeo } = await clienteUsuario
      .from("mapeos_categoria_canal")
      .select("ruta_categoria, categoria_externa_id")
      .eq("superficie_id", superficie.id)
      .eq("operacion", propiedad.tipo_operacion)
      .eq("tipo_propiedad", propiedad.tipo_propiedad)
      .eq("activo", true)
      .maybeSingle();
    categoriaMatch = mapeo ?? null;
  }

  const faltantes: string[] = [];

  if (superficie) {
    const { data: definiciones } = await clienteUsuario
      .from("definiciones_campos_canal")
      .select("clave_campo, etiqueta_externa, requerido")
      .eq("superficie_id", superficie.id)
      .eq("version_adapter", superficie.version_adapter_actual)
      .eq("activo", true)
      .eq("requerido", true);

    for (const campo of definiciones ?? []) {
      const valorPresente = evaluarCampoPresente(campo.clave_campo, propiedad, imagenes, categoriaMatch);
      if (!valorPresente) {
        faltantes.push(campo.etiqueta_externa ?? campo.clave_campo);
      }
    }
  }

  if (faltantes.length > 0) {
    return await crearSubjobFallido({
      clienteMotor,
      solicitudId,
      propiedad,
      asesorId,
      canalId: canal.id,
      canalCodigo,
      superficieId: superficie?.id ?? null,
      cuentaSocialId: cuenta?.id ?? null,
      versionAdapter: superficie?.version_adapter_actual ?? null,
      mensaje: `Faltan campos obligatorios en la propiedad: ${faltantes.join(", ")}.`,
    });
  }

  // ---------------------------------------------------------------
  // [7b] Moneda y precio a publicar. En Marketplace: USD se convierte a Q,
  // Q/GTQ pasan tal cual y cualquier otra moneda es VALIDATION_ERROR.
  const monedaOriginal = String(propiedad.moneda ?? "GTQ").trim().toUpperCase();
  const precioOriginal = propiedad.precio;
  let precioPublicar = propiedad.precio;
  let monedaPublicar: string = propiedad.moneda ?? "GTQ";
  if (canalCodigo === "facebook_marketplace") {
    if (monedaOriginal === "USD") {
      precioPublicar = Math.round(Number(propiedad.precio) * TIPO_CAMBIO_USD_GTQ);
      monedaPublicar = "GTQ";
    } else if (monedaOriginal !== "Q" && monedaOriginal !== "GTQ") {
      return await crearSubjobFallido({
        clienteMotor,
        solicitudId,
        propiedad,
        asesorId,
        canalId: canal.id,
        canalCodigo,
        superficieId: superficie?.id ?? null,
        cuentaSocialId: cuenta?.id ?? null,
        versionAdapter: superficie?.version_adapter_actual ?? null,
        mensaje: `Moneda "${propiedad.moneda}" no soportada para Facebook Marketplace (solo Q, GTQ o USD).`,
      });
    }
  }

  // [7c] Límites de texto de Marketplace: se rechaza con mensaje visible en
  // el CRM en lugar de fallar después dentro del Worker.
  if (canalCodigo === "facebook_marketplace") {
    const longTitulo = String(propiedad.titulo ?? "").length;
    const longDescripcion = String(textoDescripcion ?? propiedad.descripcion ?? "").length;
    const excesos: string[] = [];
    if (longTitulo > MAX_TITULO_MARKETPLACE) {
      excesos.push(`el título tiene ${longTitulo} caracteres (máximo ${MAX_TITULO_MARKETPLACE})`);
    }
    if (longDescripcion > MAX_DESCRIPCION_MARKETPLACE) {
      excesos.push(`la descripción tiene ${longDescripcion} caracteres (máximo ${MAX_DESCRIPCION_MARKETPLACE})`);
    }
    if (excesos.length > 0) {
      return await crearSubjobFallido({
        clienteMotor,
        solicitudId,
        propiedad,
        asesorId,
        canalId: canal.id,
        canalCodigo,
        superficieId: superficie?.id ?? null,
        cuentaSocialId: cuenta?.id ?? null,
        versionAdapter: superficie?.version_adapter_actual ?? null,
        mensaje: `Facebook Marketplace no acepta el texto: ${excesos.join("; ")}. Acórtalo en la ficha de la propiedad.`,
      });
    }
  }

  // ---------------------------------------------------------------
  // [31] Idempotencia: siguiente revisión para esta combinación
  // ---------------------------------------------------------------
  const siguienteVersion = await obtenerSiguienteVersion(clienteMotor, propiedad.id, canal.id, cuenta?.id ?? null);

  // ---------------------------------------------------------------
  // [10]/[11] Crea el subjob ya en QUEUED
  // ---------------------------------------------------------------
  const { data: trabajo, error: trabajoError } = await clienteMotor
    .from("trabajos_publicacion")
    .insert({
      solicitud_id: solicitudId,
      organization_id: propiedad.organization_id,
      propiedad_id: propiedad.id,
      asesor_id: asesorId,
      canal_id: canal.id,
      superficie_id: superficie?.id ?? null,
      cuenta_social_id: cuenta?.id ?? null,
      version_adapter: superficie?.version_adapter_actual ?? null,
      estado: "QUEUED",
      version_payload: siguienteVersion,
      encolado_en: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (trabajoError || !trabajo) {
    console.error(trabajoError);
    return { canal_codigo: canalCodigo, trabajo_id: "", estado: "FAILED", mensaje_error: "No se pudo crear el subjob" };
  }

  await clienteMotor.from("logs_publicacion").insert([
    { trabajo_id: trabajo.id, tipo_evento: "SUBJOB_CREATED", detalle: { canal: canalCodigo } },
    { trabajo_id: trabajo.id, tipo_evento: "VALIDATION_PASSED", detalle: {} },
  ]);

  // ---------------------------------------------------------------
  // [8] Genera contenido (TEMPLATE — sin IA en este MVP)
  // ---------------------------------------------------------------
  await clienteMotor.from("contenido_publicacion").insert({
    trabajo_id: trabajo.id,
    titulo: propiedad.titulo,
    precio: precioPublicar,
    moneda: monedaPublicar,
    ubicacion: { zona: propiedad.zona, ciudad: propiedad.ciudad, municipio_id: propiedad.municipio_id },
    categoria: categoriaMatch?.ruta_categoria ?? null,
    descripcion: textoDescripcion ?? propiedad.descripcion,
    campos_estructurados: {
      dormitorios: propiedad.dormitorios,
      banos: propiedad.banos,
      parqueos: propiedad.parqueos,
      area_construccion_m2: propiedad.area_construccion_m2,
      area_terreno_m2: propiedad.area_terreno_m2,
      moneda_original: monedaOriginal,
      precio_original: precioOriginal,
    },
    version_contenido: siguienteVersion,
    metodo_generacion: "TEMPLATE",
  });

  await clienteMotor.from("logs_publicacion").insert({ trabajo_id: trabajo.id, tipo_evento: "CONTENT_READY", detalle: {} });

  // ---------------------------------------------------------------
  // [9] Prepara assets (referencia a fotos ya en R2)
  // ---------------------------------------------------------------
  // Portada primero, luego por orden; se cortan al máximo del formulario.
  const fotosParaSubir = [...imagenes]
    .sort((a: any, b: any) => Number(!!b.es_portada) - Number(!!a.es_portada) || (a.orden ?? 0) - (b.orden ?? 0))
    .slice(0, MAX_FOTOS_MARKETPLACE);

  if (fotosParaSubir.length > 0) {
    const filas = fotosParaSubir.map((img: any, idx: number) => ({
      trabajo_id: trabajo.id,
      propiedad_id: propiedad.id,
      proveedor_almacenamiento: "r2",
      clave_almacenamiento: img.ruta_almacenamiento,
      tipo_activo: "photo",
      secuencia: idx + 1,
      estado: "PENDING",
    }));
    await clienteMotor.from("activos_publicacion").insert(filas);
  }

  await clienteMotor.from("logs_publicacion").insert([
    { trabajo_id: trabajo.id, tipo_evento: "ASSETS_READY", detalle: { total_fotos: imagenes.length, fotos_a_subir: fotosParaSubir.length } },
    { trabajo_id: trabajo.id, tipo_evento: "QUEUE_ENQUEUED", detalle: {} },
  ]);

  return { canal_codigo: canalCodigo, trabajo_id: trabajo.id, estado: "QUEUED" };
}

// Crea el subjob directamente en estado de error (nunca llega a QUEUED,
// nunca se envía al Worker — §24: "NO ENVIAR AL WORKER").
async function crearSubjobFallido(args: {
  clienteMotor: SupabaseClient;
  solicitudId: string;
  propiedad: any;
  asesorId: string;
  canalId: string | null;
  canalCodigo: string;
  superficieId: string | null;
  cuentaSocialId: string | null;
  versionAdapter: string | null;
  mensaje: string;
  estado?: string;
}): Promise<ResultadoSubjob> {
  const { clienteMotor, solicitudId, propiedad, asesorId, canalId, canalCodigo, superficieId, cuentaSocialId, versionAdapter, mensaje, estado } = args;

  if (!canalId) {
    // Canal ni siquiera existe: no hay FK válida para canal_id, así que
    // solo lo dejamos en el log de la solicitud, no como subjob.
    await clienteMotor.from("logs_publicacion").insert({
      solicitud_id: solicitudId,
      tipo_evento: "VALIDATION_FAILED",
      detalle: { canal_codigo: canalCodigo, mensaje },
    });
    return { canal_codigo: canalCodigo, trabajo_id: "", estado: "VALIDATION_ERROR", mensaje_error: mensaje };
  }

  // publication_key es única (propiedad:canal:cuenta:version), así que los
  // subjobs fallidos también necesitan su propia versión.
  const versionFallido = await obtenerSiguienteVersion(clienteMotor, propiedad.id, canalId, cuentaSocialId);

  const { data: trabajo } = await clienteMotor
    .from("trabajos_publicacion")
    .insert({
      solicitud_id: solicitudId,
      organization_id: propiedad.organization_id,
      propiedad_id: propiedad.id,
      asesor_id: asesorId,
      canal_id: canalId,
      superficie_id: superficieId,
      cuenta_social_id: cuentaSocialId,
      version_adapter: versionAdapter,
      estado: estado ?? "VALIDATION_ERROR",
      version_payload: versionFallido,
      mensaje_error: mensaje,
    })
    .select("id")
    .single();

  if (trabajo) {
    await clienteMotor.from("logs_publicacion").insert({
      trabajo_id: trabajo.id,
      tipo_evento: "VALIDATION_FAILED",
      detalle: { mensaje },
    });
  }

  return { canal_codigo: canalCodigo, trabajo_id: trabajo?.id ?? "", estado: estado ?? "VALIDATION_ERROR", mensaje_error: mensaje };
}

// Siguiente version_payload para propiedad + canal + cuenta (idempotencia §31).
// Cuando no hay cuenta se usa .is(null); .eq(null) no encuentra nada en PostgREST.
async function obtenerSiguienteVersion(
  clienteMotor: SupabaseClient,
  propiedadId: string,
  canalId: string,
  cuentaSocialId: string | null
): Promise<number> {
  let consulta = clienteMotor
    .from("trabajos_publicacion")
    .select("version_payload")
    .eq("propiedad_id", propiedadId)
    .eq("canal_id", canalId);

  consulta = cuentaSocialId
    ? consulta.eq("cuenta_social_id", cuentaSocialId)
    : consulta.is("cuenta_social_id", null);

  const { data } = await consulta.order("version_payload", { ascending: false }).limit(1);
  return data && data.length > 0 ? data[0].version_payload + 1 : 1;
}

// Evalúa si un campo requerido está presente en la propiedad/derivados.
function evaluarCampoPresente(clave: string, propiedad: any, imagenes: any[], categoriaMatch: any): boolean {
  switch (clave) {
    case "titulo":
      return !!propiedad.titulo?.trim();
    case "precio":
      return propiedad.precio !== null && propiedad.precio !== undefined && Number(propiedad.precio) > 0;
    case "categoria":
      return !!categoriaMatch;
    case "ubicacion":
      return !!(propiedad.zona?.trim() || propiedad.ciudad?.trim() || propiedad.municipio_id);
    case "descripcion":
      return !!propiedad.descripcion?.trim();
    case "fotos":
      return imagenes.length > 0;
    default:
      // Campo desconocido: no bloquea (evita falsos negativos por
      // definiciones futuras que el Edge Function aún no interpreta).
      return true;
  }
}

function jsonError(mensaje: string, status: number): Response {
  return new Response(JSON.stringify({ error: mensaje }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
