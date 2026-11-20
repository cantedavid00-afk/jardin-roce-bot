import { createScriptClient } from './scripts/lib/supabase-script-env.mjs'

// Script local de diagnóstico (solo lectura). Acceso: admin → clave secreta (lee tablas con datos personales; omite RLS).
// Uso: node --env-file=.env.local query_conversations.mjs
const supa = createScriptClient('admin')

async function main() {
  // Obtener todos los mensajes, ordenados por fecha descendente
  const { data: all } = await supa
    .from('historial_chat')
    .select('*')
    .order('creado_en', { ascending: false })
    .limit(500)

  if (!all) { console.error('Error'); return }

  // Encontrar los últimos mensajes de cada cliente (por teléfono)
  const { data: clientes } = await supa
    .from('clientes')
    .select('id, telefono')
    .order('creado_en', { ascending: false })
    .limit(15)

  if (!clientes) return

  console.log('='.repeat(80))
  console.log('ULTIMAS 10 CONVERSACIONES COMPLETAS')
  console.log('='.repeat(80))
  console.log()

  for (const cliente of clientes) {
    const msgs = all.filter(m => {
      // Buscar por cliente_id
      return true
    })

    // Obtener historial de este cliente
    const { data: hist } = await supa
      .from('historial_chat')
      .select('*')
      .eq('cliente_id', cliente.id)
      .order('creado_en', { ascending: true })
      .limit(30)

    if (!hist || hist.length === 0) continue

    console.log('─'.repeat(80))
    console.log(`📱 CLIENTE: ${cliente.telefono} (${hist.length} mensajes)`)
    console.log('─'.repeat(80))

    for (const m of hist) {
      const fecha = new Date(m.creado_en).toLocaleString('es-MX', { hour: '2-digit', minute: '2-digit' })
      const rol = m.rol || '?'
      const origen = m.origen || 'null'
      const contenido = (m.contenido || '').substring(0, 150)
      let etiqueta = ''

      if (rol === 'user') {
        etiqueta = '👤 CLIENTE'
      } else if (rol === 'assistant' && origen === 'equipo') {
        etiqueta = '👥 EQUIPO'
      } else if (rol === 'assistant' && origen === 'flora') {
        etiqueta = '🌸 FLORA'
      } else if (rol === 'assistant' && origen === 'sistema') {
        etiqueta = '⚙️ SISTEMA'
      } else {
        etiqueta = `❓ ${rol}/${origen}`
      }

      // Marcar si es mensaje verificado del equipo
      const esVerificado = origen === 'equipo'
      const verificacion = esVerificado ? ' ✅VERIFICADO' : ''

      console.log(`  [${fecha}] ${etiqueta}${verificacion}`)
      console.log(`           ${contenido}`)
      if ((m.contenido||'').length > 150) console.log(`           ...(${m.contenido.length} chars)`)
    }
    console.log()
    console.log()
  }
}

main().catch(e => console.error('Fatal:', e.message))
