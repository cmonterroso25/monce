import { createClient } from '@supabase/supabase-js'

// Cliente con service role key — bypasea RLS por completo. Uso exclusivo
// desde Server Actions o rutas ya protegidas por verificación de sesión y
// rol en el propio código (nunca depender de RLS para restringir su uso).
// Nunca exponer a componentes de cliente, ni pasar su instancia a n8n u
// otro proceso externo.
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
