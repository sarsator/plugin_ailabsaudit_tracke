"""
Test de CONTRAT entre l'API AI Labs Audit et le collecteur Python.

Les autres tests valident la signature HMAC et la détection contre les listes
compilées en dur. Celui-ci sert la réponse RÉELLE de l'API (fixture produite
par l'application Flask, partagée avec les tests Go, PHP et Cloudflare) sur un
serveur HTTP local, puis vérifie que ListCache charge effectivement les
patterns. Le bug de production venait de là : HTTP 200, JSON valide, clé
attendue absente, zéro pattern chargé, aucune trace.

Run: python3 collectors/python/tests/test_contract.py -v
"""
import json
import os
import sys
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'src'))

from ailabsaudit_tracker.cache import ListCache          # noqa: E402
from ailabsaudit_tracker.defaults import BOT_SIGNATURES  # noqa: E402
from ailabsaudit_tracker.detector import match_bot       # noqa: E402

TESTDATA = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                        '..', '..', 'log-agent', 'testdata')


def fixture(nom):
    with open(os.path.join(TESTDATA, nom), encoding='utf-8') as f:
        return json.load(f)


class _Poignee(BaseHTTPRequestHandler):
    corps = b'{}'
    etag = '"x"'

    def do_GET(self):
        if self.headers.get('If-None-Match') == self.etag:
            self.send_response(304)
            self.send_header('ETag', self.etag)
            self.end_headers()
            return
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('ETag', self.etag)
        self.send_header('Content-Length', str(len(self.corps)))
        self.end_headers()
        self.wfile.write(self.corps)

    def log_message(self, *a):
        pass


class ServeurAPI:
    """Serveur local rejouant une réponse de l'API."""

    def __init__(self, corps, etag):
        poignee = type('P', (_Poignee,), {
            'corps': json.dumps(corps).encode(), 'etag': etag})
        self.httpd = HTTPServer(('127.0.0.1', 0), poignee)
        self.url = f"http://127.0.0.1:{self.httpd.server_address[1]}/api/v1"
        self.fil = threading.Thread(target=self.httpd.serve_forever, daemon=True)
        self.fil.start()

    def __enter__(self):
        return self

    def __exit__(self, *a):
        self.httpd.shutdown()
        self.httpd.server_close()


def _signer(timestamp, method, path, body, secret):
    return 'signature-de-test'


def cache_de_test(url):
    return ListCache(url, 'trk_test', 'secret', _signer)


class TestContratListes(unittest.TestCase):

    def test_reponse_reelle_charge_les_patterns(self):
        fx = fixture('api_bot_signatures.json')
        with ServeurAPI(fx['corps'], fx['etag']) as srv:
            c = cache_de_test(srv.url)
            repli = list(BOT_SIGNATURES)
            c._refresh_bot_signatures()
            # lecture directe de l'etat interne : get_bot_signatures() declenche
            # un rafraichissement asynchrone qui rendrait le test dependant
            # d'une course entre threads.
            patterns = list(c._bot_signatures)

        self.assertTrue(
            patterns,
            "0 pattern extrait : HTTP 200 + JSON valide ne prouvent rien")
        self.assertEqual(len(patterns), 5, "liste incomplète")
        self.assertNotEqual(patterns, repli, "le repli n'a pas été remplacé")

    def test_referents_charges(self):
        fx = fixture('api_ai_referrers.json')
        with ServeurAPI(fx['corps'], fx['etag']) as srv:
            c = cache_de_test(srv.url)
            c._refresh_ai_referrers()
            self.assertEqual(len(c._ai_referrers), 3)

    def test_signature_absente_du_repli_devient_detectable(self):
        temoin = 'AI21Bot'
        ua = 'Mozilla/5.0 (compatible; AI21Bot/1.0; +https://ai21.com/bot)'
        self.assertFalse(match_bot(ua, BOT_SIGNATURES),
                         f"témoin invalide : {temoin} est déjà dans le repli")

        fx = fixture('api_bot_signatures.json')
        with ServeurAPI(fx['corps'], fx['etag']) as srv:
            c = cache_de_test(srv.url)
            c._refresh_bot_signatures()
            patterns = list(c._bot_signatures)

        self.assertIn(temoin, patterns, "la liste ne vient pas du serveur")
        self.assertEqual(match_bot(ua, patterns), temoin,
                         "le moteur de détection ne reconnaît pas le témoin")

    def test_etag_memorise(self):
        fx = fixture('api_bot_signatures.json')
        with ServeurAPI(fx['corps'], fx['etag']) as srv:
            c = cache_de_test(srv.url)
            c._refresh_bot_signatures()
            self.assertEqual(c._bot_etag, fx['etag'])

    def test_304_conserve_la_liste(self):
        fx = fixture('api_bot_signatures.json')
        with ServeurAPI(fx['corps'], fx['etag']) as srv:
            c = cache_de_test(srv.url)
            c._refresh_bot_signatures()
            premiers = list(c._bot_signatures)
            c._refresh_bot_signatures()   # le serveur répondra 304
            self.assertEqual(list(c._bot_signatures), premiers)

    def test_cas_degrades_conservent_le_repli(self):
        cas = {
            'ancienne enveloppe data/meta': {'data': [{'pattern': 'GPTBot'}], 'meta': {}},
            'liste vide': {'signatures': [], 'data': [], 'meta': {}},
            'structure inattendue': {'signatures': [{'autre': 'x'}], 'data': [], 'meta': {}},
            'corps vide': {},
        }
        for intitule, corps in cas.items():
            with self.subTest(intitule):
                with ServeurAPI(corps, '"x"') as srv:
                    c = cache_de_test(srv.url)
                    avant = list(BOT_SIGNATURES)
                    c._refresh_bot_signatures()
                    self.assertEqual(list(c._bot_signatures), avant,
                                     "le repli a été écrasé")


if __name__ == '__main__':
    unittest.main(verbosity=2)
