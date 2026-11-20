import { createScriptClient } from './scripts/lib/supabase-script-env.mjs'

// Script local de diagnóstico (solo lectura). Acceso: public → clave publicable (respeta RLS).
// Uso: node --env-file=.env.local check-prompt.mjs
const supa = createScriptClient('public')

// Get the current system prompt
;(async () => {
  const { data: promptData, error: promptError } = await supa
    .from('configuracion_bot')
    .select('valor')
    .eq('clave', 'system_prompt')
    .maybeSingle()
  console.log('=== SISTEMA ACTUAL ===')
  console.log(promptData?.valor || 'No encontrado')
  console.log('\n---')
  
  // Check all config
  const { data: allConfig, error: allError } = await supa
    .from('configuracion_bot')
    .select('clave, valor')
  console.log('=== TODAS LAS CONFIGURACIONES ===')
  allConfig?.forEach(c => {
    const val = c.valor?.substring ? c.valor.substring(0, 200) : c.valor
    console.log(`\${c.clave}: \${val}`)
  })
})()