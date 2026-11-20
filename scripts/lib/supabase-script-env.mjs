// scripts/lib/supabase-script-env.mjs
//
// Configuración de Supabase para scripts locales de diagnóstico/mantenimiento.
// Existe para que ninguna clave vuelva a quedar escrita en el código: los scripts
// leen la URL y la clave del entorno (`node --env-file=.env.local <script>`) y
// fallan de forma segura si falta algo o si la clave no corresponde al nivel de
// acceso pedido. Los mensajes de error nombran variables, nunca valores.
//
// Niveles de acceso:
//   'admin'  → clave secreta (sb_secret_… o JWT legado con role=service_role).
//              Omite RLS. Solo para scripts que se ejecutan en tu máquina.
//   'public' → clave publicable (sb_publishable_… o JWT legado con role=anon).
//              Respeta RLS.

import { createClient } from '@supabase/supabase-js'

export class SupabaseScriptConfigError extends Error {
  constructor(message) {
    super(message)
    this.name = 'SupabaseScriptConfigError'
  }
}

const ADMIN_KEY_VARS = ['SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY']
const PUBLIC_KEY_VARS = [
  'SUPABASE_PUBLISHABLE_KEY',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
]
const URL_VARS = ['SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL']

function firstDefined(env, names) {
  for (const name of names) {
    const value = env[name]
    if (typeof value === 'string' && value.trim() !== '') return value.trim()
  }
  return undefined
}

function jwtRole(key) {
  const parts = key.split('.')
  if (parts.length !== 3) return undefined
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
    return typeof payload.role === 'string' ? payload.role : undefined
  } catch {
    return undefined
  }
}

/** Clasifica una clave sin exponerla: 'secret' | 'publishable' | 'unknown'. */
export function classifySupabaseKey(key) {
  if (key.startsWith('sb_secret_')) return 'secret'
  if (key.startsWith('sb_publishable_')) return 'publishable'
  const role = jwtRole(key)
  if (role === 'service_role') return 'secret'
  if (role === 'anon') return 'publishable'
  return 'unknown'
}

/**
 * Valida y devuelve { url, key } para el nivel de acceso pedido.
 * Lanza SupabaseScriptConfigError (sin valores en el mensaje) si algo no cuadra.
 */
export function resolveSupabaseScriptConfig(access, env = process.env) {
  if (typeof globalThis.window !== 'undefined') {
    throw new SupabaseScriptConfigError('Este módulo solo puede ejecutarse en Node.js, nunca en el navegador.')
  }
  if (access !== 'admin' && access !== 'public') {
    throw new SupabaseScriptConfigError(`Nivel de acceso inválido: usa 'admin' o 'public'.`)
  }

  const url = firstDefined(env, URL_VARS)
  const keyVars = access === 'admin' ? ADMIN_KEY_VARS : PUBLIC_KEY_VARS
  const key = firstDefined(env, keyVars)

  const missing = []
  if (!url) missing.push(URL_VARS.join(' o '))
  if (!key) missing.push(keyVars.join(' o '))
  if (missing.length > 0) {
    throw new SupabaseScriptConfigError(
      `Faltan variables de entorno: ${missing.join('; ')}. ` +
        'Ejecuta el script con: node --env-file=.env.local <script>'
    )
  }

  let parsedUrl
  try {
    parsedUrl = new URL(url)
  } catch {
    throw new SupabaseScriptConfigError('La URL de Supabase no es una URL válida.')
  }
  const isLocal = parsedUrl.hostname === 'localhost' || parsedUrl.hostname === '127.0.0.1'
  if (parsedUrl.protocol !== 'https:' && !isLocal) {
    throw new SupabaseScriptConfigError('La URL de Supabase debe usar https://.')
  }

  const kind = classifySupabaseKey(key)
  if (access === 'admin' && kind !== 'secret') {
    throw new SupabaseScriptConfigError(
      'Este script necesita una clave secreta (sb_secret_… o service_role) y la configurada no lo es.'
    )
  }
  if (access === 'public' && kind === 'secret') {
    throw new SupabaseScriptConfigError(
      'Este script solo necesita la clave publicable; no uses una clave secreta para él.'
    )
  }
  if (access === 'public' && kind === 'unknown') {
    throw new SupabaseScriptConfigError('La clave publicable no tiene un formato reconocido.')
  }

  return { url, key }
}

/** Crea el cliente o termina el proceso con código 1 y un mensaje sin secretos. */
export function createScriptClient(access) {
  let config
  try {
    config = resolveSupabaseScriptConfig(access)
  } catch (error) {
    if (error instanceof SupabaseScriptConfigError) {
      console.error(`[config] ${error.message}`)
      process.exit(1)
    }
    throw error
  }
  return createClient(config.url, config.key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
