// Pruebas de seguridad de la configuración de Supabase para scripts locales.
// Ejecutar: npm run test:security   (no requiere red ni credenciales reales)
//
// Todas las claves de este archivo son FICTICIAS: se generan aquí con firma falsa.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync, execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import {
  classifySupabaseKey,
  resolveSupabaseScriptConfig,
  SupabaseScriptConfigError,
} from '../../scripts/lib/supabase-script-env.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

function fakeJwt(role) {
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
  return `${enc({ alg: 'HS256', typ: 'JWT' })}.${enc({ role, iss: 'test' })}.firma-falsa`
}

const URL_OK = 'https://example-project.supabase.co'
const FAKE_SECRET = 'sb_secret_TEST_ONLY_not_a_real_key'
const FAKE_PUBLISHABLE = 'sb_publishable_TEST_ONLY_not_a_real_key'

test('classifySupabaseKey reconoce formatos nuevos y legados', () => {
  assert.equal(classifySupabaseKey(FAKE_SECRET), 'secret')
  assert.equal(classifySupabaseKey(FAKE_PUBLISHABLE), 'publishable')
  assert.equal(classifySupabaseKey(fakeJwt('service_role')), 'secret')
  assert.equal(classifySupabaseKey(fakeJwt('anon')), 'publishable')
  assert.equal(classifySupabaseKey('cualquier-cosa'), 'unknown')
})

test('admin: acepta sb_secret y service_role legado; prefiere SUPABASE_SECRET_KEY', () => {
  const legacy = fakeJwt('service_role')
  assert.equal(
    resolveSupabaseScriptConfig('admin', { NEXT_PUBLIC_SUPABASE_URL: URL_OK, SUPABASE_SERVICE_ROLE_KEY: legacy }).key,
    legacy
  )
  assert.equal(
    resolveSupabaseScriptConfig('admin', {
      SUPABASE_URL: URL_OK,
      SUPABASE_SECRET_KEY: FAKE_SECRET,
      SUPABASE_SERVICE_ROLE_KEY: legacy,
    }).key,
    FAKE_SECRET
  )
})

test('admin: rechaza una clave pública (no escala privilegios por error)', () => {
  assert.throws(
    () => resolveSupabaseScriptConfig('admin', { SUPABASE_URL: URL_OK, SUPABASE_SECRET_KEY: FAKE_PUBLISHABLE }),
    SupabaseScriptConfigError
  )
  assert.throws(
    () => resolveSupabaseScriptConfig('admin', { SUPABASE_URL: URL_OK, SUPABASE_SERVICE_ROLE_KEY: fakeJwt('anon') }),
    SupabaseScriptConfigError
  )
})

test('public: rechaza una clave secreta (mínimo privilegio)', () => {
  assert.throws(
    () => resolveSupabaseScriptConfig('public', { SUPABASE_URL: URL_OK, SUPABASE_PUBLISHABLE_KEY: FAKE_SECRET }),
    SupabaseScriptConfigError
  )
  assert.equal(
    resolveSupabaseScriptConfig('public', { SUPABASE_URL: URL_OK, NEXT_PUBLIC_SUPABASE_ANON_KEY: fakeJwt('anon') }).url,
    URL_OK
  )
})

test('faltan variables → error que nombra variables y NO contiene valores', () => {
  try {
    resolveSupabaseScriptConfig('admin', { SUPABASE_URL: URL_OK })
    assert.fail('debió lanzar')
  } catch (error) {
    assert.ok(error instanceof SupabaseScriptConfigError)
    assert.match(error.message, /SUPABASE_SECRET_KEY/)
    assert.ok(!error.message.includes(URL_OK), 'el mensaje no debe incluir valores')
  }
})

test('URL sin https es rechazada (salvo localhost)', () => {
  assert.throws(
    () => resolveSupabaseScriptConfig('admin', { SUPABASE_URL: 'http://example.com', SUPABASE_SECRET_KEY: FAKE_SECRET }),
    SupabaseScriptConfigError
  )
  assert.doesNotThrow(() =>
    resolveSupabaseScriptConfig('admin', { SUPABASE_URL: 'http://localhost:54321', SUPABASE_SECRET_KEY: FAKE_SECRET })
  )
})

test('un script real sin variables termina con código 1, sin red y sin imprimir secretos', () => {
  for (const script of ['check-prompt.mjs', 'query_conversation.mjs']) {
    const result = spawnSync(process.execPath, [script], {
      cwd: ROOT,
      env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot },
      encoding: 'utf8',
      timeout: 20_000,
    })
    assert.equal(result.status, 1, `${script} debe salir con código 1`)
    assert.match(result.stderr, /\[config\] Faltan variables de entorno/)
    assert.doesNotMatch(result.stderr + result.stdout, /eyJhbGciOi|sb_secret_[A-Za-z0-9]/)
  }
})

test('ningún archivo versionado contiene claves de Supabase incrustadas', () => {
  let out = ''
  try {
    out = execFileSync(
      'git',
      ['grep', '-lE', 'eyJhbGciOi[A-Za-z0-9_-]*\\.[A-Za-z0-9_-]{20,}|sb_secret_[A-Za-z0-9_-]{20,}', '--', '.', ':!tests/security/*'],
      { cwd: ROOT, encoding: 'utf8' }
    )
  } catch (error) {
    if (error.status === 1) out = '' // git grep: sin coincidencias
    else throw error
  }
  assert.equal(out.trim(), '', `Claves incrustadas encontradas en: ${out}`)
})
