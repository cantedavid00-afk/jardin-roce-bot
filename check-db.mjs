import { createScriptClient } from './scripts/lib/supabase-script-env.mjs'

// Script local de diagnóstico (solo lectura). Acceso: public → clave publicable (respeta RLS).
// Uso: node --env-file=.env.local check-db.mjs
const supa = createScriptClient('public')

// Check pedidos_bot with more details
;(async () => {
  const { data: pedidos, error: pedError } = await supa
    .from('pedidos_bot')
    .select('*, clientes!inner(telefono, cliente_nombre)')
    .limit(10)
  
  if (pedError) console.error('Error pedidos:', pedError.message)
  else {
    console.log('=== ULTIMOS PEDIDOS BOT ===')
    pedidos?.forEach(p => {
      const cliente = p.clientes?.cliente_nombre || p.cliente_nombre || 'Sin nombre'
      const telefono = p.clientes?.telefono || p.telefono || 'Sin tel'
      const estado = p.estado_flujo || p.estado || 'Sin estado'
      const producto = p.producto || 'Sin producto'
      console.log(`\${telefono} | \${cliente} | \${producto} | \${estado}`)
    })
  }
  
  // Check if there are any recent status changes
  const { count, error: countError } = await supa
    .from('pedidos_bot')
    .select('*', { count: 'exact', head: true })
    .gte('actualizado_en', new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString())
  
  console.log('\nPedidos actualizados en 4 dias:', count || 0)
  
  // Check config for empleados_notificar
  const { data: config, error: configError } = await supa
    .from('configuracion_bot')
    .select('valor')
    .eq('clave', 'empleados_notificar')
    .maybeSingle()
  
  if (config && config.valor) {
    console.log('\nEmpleados a notificar:', config.valor)
  }
  
  // Check bot_status heartbeat
  const { data: status, error: statusError } = await supa
    .from('configuracion_bot')
    .select('valor')
    .eq('clave', 'bot_status')
    .maybeSingle()
  
  if (status && status.valor) {
    const heartbeat = status.valor.heartbeat ? new Date(status.valor.heartbeat) : null
    const diff = heartbeat ? Date.now() - new Date(status.valor.heartbeat) : null
    console.log('\nUltimo heartbeat:', heartbeat, 'hace', diff ? Math.round(diff/60000) + ' min' : 'n/a')
    console.log('Estado:', status.valor.estado)
    console.log('Connected:', status.valor.connected)
  }
})()