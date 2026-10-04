-- Cada asesor administra sus propias cuentas sociales.
-- Las políticas existentes (admin/propietario) siguen vigentes: las permisivas se suman.

drop policy if exists "Asesor crea sus cuentas sociales" on cuentas_sociales;
create policy "Asesor crea sus cuentas sociales"
  on cuentas_sociales for insert to authenticated
  with check (
    organization_id = mi_organization_id()
    and asesor_id = auth.uid()
    and estado = 'PENDING_SETUP'
    and referencia_sesion is null
    and autenticada_en is null
    and usada_en is null
    and superficie_preferida_id is null
  );

drop policy if exists "Asesor elimina sus cuentas sociales" on cuentas_sociales;
create policy "Asesor elimina sus cuentas sociales"
  on cuentas_sociales for delete to authenticated
  using (
    organization_id = mi_organization_id()
    and asesor_id = auth.uid()
    and estado <> 'BUSY'
  );
