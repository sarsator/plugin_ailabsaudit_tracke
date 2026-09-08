'use strict';

/**
 * Test de CONTRAT entre l'API AI Labs Audit et le Worker Cloudflare.
 *
 * Les autres tests de ce dossier lisent defaults.js comme du texte : ils ne
 * prouvent rien sur ce que le Worker charge réellement depuis l'API. Ici on
 * exécute le vrai code de src/cache.js contre la réponse RÉELLE de l'API
 * (fixture produite par l'application Flask, partagée avec les tests Go et
 * PHP), avec caches.default et fetch simulés.
 *
 * Run: node tests/contract.test.js
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const RACINE = path.join(__dirname, '..');
const TESTDATA = path.join(RACINE, '..', 'log-agent', 'testdata');

let reussites = 0;

function verifier(intitule, fn) {
  try {
    fn();
    reussites++;
    console.log(`  OK   ${intitule}`);
  } catch (e) {
    console.log(`  FAIL ${intitule} — ${e.message}`);
    process.exitCode = 1;
  }
}

function fixture(nom) {
  return JSON.parse(fs.readFileSync(path.join(TESTDATA, nom), 'utf8'));
}

/** Environnement Worker simulé : pas de Cache API persistante, fetch scripté. */
function preparerEnvironnement(corps, etag) {
  globalThis.caches = {
    default: {
      match: async () => undefined,   // cache toujours froid
      put: async () => {},
    },
  };
  globalThis.fetch = async () =>
    new Response(JSON.stringify(corps), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ETag: etag },
    });
}

const env = {
  API_URL: 'https://exemple.test/api/v1',
  API_KEY: 'trk_test',
  API_SECRET: 'secret',
  CLIENT_ID: 'CLT-TEST',
};

const signer = async () => 'signature-de-test';

(async () => {
  console.log('Contrat API → Worker Cloudflare');

  const { getBotSignatures, getAiReferrers } = await import(
    path.join(RACINE, 'src', 'cache.js')
  );
  const { BOT_SIGNATURES } = await import(path.join(RACINE, 'src', 'defaults.js'));

  // ── 1. La réponse réelle de l'API charge bien la liste ──
  const fx = fixture('api_bot_signatures.json');
  preparerEnvironnement(fx.corps, fx.etag);
  const patterns = await getBotSignatures(env, signer);

  verifier('la reponse reelle de l API charge des patterns', () =>
    assert.ok(patterns.length > 0,
      '0 pattern extrait : HTTP 200 + JSON valide ne prouvent rien'));
  verifier('liste complete (5 patterns)', () =>
    assert.strictEqual(patterns.length, 5));
  verifier('la liste remplace le repli compile', () =>
    assert.notDeepStrictEqual(patterns, BOT_SIGNATURES));

  // ── 2. Test discriminant ──
  const temoin = 'AI21Bot';
  verifier(`temoin ${temoin} absent du repli compile`, () =>
    assert.ok(!BOT_SIGNATURES.some((s) => s.toLowerCase() === temoin.toLowerCase())));
  verifier(`temoin ${temoin} present apres refresh`, () =>
    assert.ok(patterns.includes(temoin)));

  // ── 3. Referents ──
  const fxr = fixture('api_ai_referrers.json');
  preparerEnvironnement(fxr.corps, fxr.etag);
  const domaines = await getAiReferrers(env, signer);
  verifier('les referents sont charges (3 domaines)', () =>
    assert.strictEqual(domaines.length, 3));

  // ── 4. Cas degrades : le repli doit etre conserve ──
  const degrades = {
    'ancienne enveloppe data/meta seule': { data: [{ pattern: 'GPTBot' }], meta: {} },
    'liste vide': { signatures: [], data: [], meta: {} },
    'structure inattendue': { signatures: [{ autre: 'champ' }], data: [], meta: {} },
    'corps vide': {},
  };
  for (const [intitule, corps] of Object.entries(degrades)) {
    preparerEnvironnement(corps, '"x"');
    const obtenu = await getBotSignatures(env, signer);
    verifier(`${intitule} : le repli est conserve`, () =>
      assert.deepStrictEqual(obtenu, BOT_SIGNATURES));
  }

  console.log(`\n${reussites} reussites`);
})();
