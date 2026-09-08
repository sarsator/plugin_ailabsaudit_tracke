package main

// Tests de CONTRAT entre l'API AI Labs Audit et le log-agent.
//
// Les autres tests valident des morceaux isolés (signature HMAC contre des
// vecteurs figés, détection contre les listes compilées en dur). Aucun ne
// vérifiait que la réponse RÉELLE de l'API est consommable par cet agent.
// C'est précisément ce qui a échoué en production : l'API répondait 200 avec
// un JSON valide dont la clé attendue était absente, refreshBotSignatures
// extrayait 0 pattern, ne journalisait rien, et l'agent restait indéfiniment
// sur ses listes de repli.
//
// Les fixtures de testdata/ ne sont pas écrites à la main : elles sont
// produites par l'application Flask réelle
// (scripts/generer_fixture_contrat_tracker.py côté serveur). Si le contrat
// serveur change, ces tests cassent.

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

type fixtureAPI struct {
	Etag  string          `json:"etag"`
	Corps json.RawMessage `json:"corps"`
}

func chargerFixture(t *testing.T, nom string) fixtureAPI {
	t.Helper()
	brut, err := os.ReadFile(filepath.Join("testdata", nom))
	if err != nil {
		t.Fatalf("fixture %s illisible: %v", nom, err)
	}
	var f fixtureAPI
	if err := json.Unmarshal(brut, &f); err != nil {
		t.Fatalf("fixture %s invalide: %v", nom, err)
	}
	return f
}

// serveurAPI rejoue une réponse de l'API réelle, avec gestion de If-None-Match.
func serveurAPI(t *testing.T, parChemin map[string]fixtureAPI, appels *int) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		f, connu := parChemin[r.URL.Path]
		if !connu {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		if appels != nil {
			*appels++
		}
		if inm := r.Header.Get("If-None-Match"); inm != "" && inm == f.Etag {
			w.Header().Set("ETag", f.Etag)
			w.WriteHeader(http.StatusNotModified)
			return
		}
		w.Header().Set("ETag", f.Etag)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(f.Corps)
	}))
}

func cacheDeTest(urlAPI string) *signatureListCache {
	return &signatureListCache{
		bots:   botSignatures,
		refs:   aiReferrers,
		cfg:    &config{APIKey: "trk_test", APISecret: "secret", APIURL: urlAPI, ClientID: "CLT-TEST"},
		client: &http.Client{},
	}
}

// ─────────────────────────────────────────────────────────────────────
// Le contrat : la réponse réelle de l'API doit charger des patterns
// ─────────────────────────────────────────────────────────────────────

func TestContratBotSignaturesChargeLaListe(t *testing.T) {
	fixtures := map[string]fixtureAPI{
		"/bot-signatures": chargerFixture(t, "api_bot_signatures.json"),
	}
	srv := serveurAPI(t, fixtures, nil)
	defer srv.Close()

	c := cacheDeTest(srv.URL)
	avant, _ := c.get()
	c.refreshBotSignatures()
	apres, _ := c.get()

	if len(apres) == 0 {
		t.Fatal("0 pattern chargé : HTTP 200 + JSON valide ne prouvent rien, " +
			"c'est exactement le bug qui est resté invisible en production")
	}
	if len(apres) != 5 {
		t.Fatalf("liste incomplète : %d patterns chargés, 5 attendus", len(apres))
	}
	if len(apres) == len(avant) && apres[0] == avant[0] {
		t.Fatal("la liste n'a pas été remplacée : l'agent est resté sur son repli")
	}
}

func TestContratAiReferrersChargeLaListe(t *testing.T) {
	fixtures := map[string]fixtureAPI{
		"/ai-referrers": chargerFixture(t, "api_ai_referrers.json"),
	}
	srv := serveurAPI(t, fixtures, nil)
	defer srv.Close()

	c := cacheDeTest(srv.URL)
	c.refreshAiReferrers()
	_, refs := c.get()

	if len(refs) != 3 {
		t.Fatalf("%d domaines chargés, 3 attendus", len(refs))
	}
}

// ─────────────────────────────────────────────────────────────────────
// Test discriminant : une signature absente du repli compilé
// ─────────────────────────────────────────────────────────────────────

func TestContratSignatureAbsenteDuRepliDevientDetectable(t *testing.T) {
	const temoin = "AI21Bot"
	const uaTemoin = "Mozilla/5.0 (compatible; AI21Bot/1.0; +https://ai21.com/bot)"

	// 1. Le témoin n'est PAS dans la liste compilée en dur.
	if p := matchBot(uaTemoin, botSignatures); p != "" {
		t.Fatalf("témoin invalide : %q est déjà dans le repli (match %q)", temoin, p)
	}

	fixtures := map[string]fixtureAPI{
		"/bot-signatures": chargerFixture(t, "api_bot_signatures.json"),
	}
	srv := serveurAPI(t, fixtures, nil)
	defer srv.Close()

	c := cacheDeTest(srv.URL)
	c.refreshBotSignatures()
	bots, _ := c.get()

	// 2. Il est présent dans le cache d'exécution après rafraîchissement.
	trouve := false
	for _, b := range bots {
		if b == temoin {
			trouve = true
			break
		}
	}
	if !trouve {
		t.Fatalf("%q absent du cache après refresh : la liste ne vient pas du serveur", temoin)
	}

	// 3. Le moteur de détection le reconnaît réellement.
	if p := matchBot(uaTemoin, bots); p != temoin {
		t.Fatalf("moteur de détection : match %q, attendu %q", p, temoin)
	}
}

// ─────────────────────────────────────────────────────────────────────
// ETag / 304
// ─────────────────────────────────────────────────────────────────────

func TestContratEtagPuis304ConserveLaListe(t *testing.T) {
	fixtures := map[string]fixtureAPI{
		"/bot-signatures": chargerFixture(t, "api_bot_signatures.json"),
	}
	srv := serveurAPI(t, fixtures, nil)
	defer srv.Close()

	c := cacheDeTest(srv.URL)
	c.refreshBotSignatures()

	if c.botEtag == "" {
		t.Fatal("ETag non mémorisé : chaque cycle re-télécharge la liste entière")
	}
	premiers, _ := c.get()

	// Deuxième passage : le serveur doit répondre 304 et la liste rester intacte.
	c.refreshBotSignatures()
	seconds, _ := c.get()

	if len(seconds) != len(premiers) {
		t.Fatalf("après 304 la liste a changé : %d puis %d", len(premiers), len(seconds))
	}
}

// ─────────────────────────────────────────────────────────────────────
// Cas dégradés : l'agent doit conserver son repli, jamais l'écraser
// ─────────────────────────────────────────────────────────────────────

func TestContratReponseSansCleAttendueNecraseRienEtEstDetectable(t *testing.T) {
	// Exactement l'ancienne réponse du serveur : enveloppe data/meta seule.
	ancienne := fixtureAPI{
		Etag:  `"ancien"`,
		Corps: json.RawMessage(`{"data":[{"pattern":"GPTBot"}],"meta":{"request_id":"x"}}`),
	}
	srv := serveurAPI(t, map[string]fixtureAPI{"/bot-signatures": ancienne}, nil)
	defer srv.Close()

	c := cacheDeTest(srv.URL)
	avant, _ := c.get()
	c.refreshBotSignatures()
	apres, _ := c.get()

	// Le repli est préservé (pas de régression), mais rien n'a été chargé :
	// c'est l'anomalie « 200 + JSON valide + 0 élément » qu'un futur agent
	// devra signaler explicitement.
	if len(apres) != len(avant) {
		t.Fatalf("le repli a été écrasé : %d puis %d", len(avant), len(apres))
	}
	if c.botEtag != "" {
		t.Fatal("un ETag a été mémorisé alors qu'aucun pattern n'a été chargé")
	}

	var sonde struct {
		Signatures []struct{} `json:"signatures"`
	}
	if err := json.Unmarshal(ancienne.Corps, &sonde); err != nil {
		t.Fatalf("JSON pourtant valide: %v", err)
	}
	if len(sonde.Signatures) != 0 {
		t.Fatal("la fixture ancienne devrait être vide côté clé historique")
	}
}

func TestContratListeVideConserveLeRepli(t *testing.T) {
	vide := fixtureAPI{
		Etag:  `"vide"`,
		Corps: json.RawMessage(`{"signatures":[],"data":[],"meta":{"request_id":"x"}}`),
	}
	srv := serveurAPI(t, map[string]fixtureAPI{"/bot-signatures": vide}, nil)
	defer srv.Close()

	c := cacheDeTest(srv.URL)
	avant, _ := c.get()
	c.refreshBotSignatures()
	apres, _ := c.get()

	if len(apres) != len(avant) {
		t.Fatalf("liste vide : le repli a été écrasé (%d → %d)", len(avant), len(apres))
	}
}

func TestContratStructureInattendueNecrasePasLeRepli(t *testing.T) {
	cas := []string{
		`{"signatures":"pas-un-tableau","data":[]}`,
		`{"signatures":[{"pattern":null},{"pattern":""}],"data":[]}`,
		`{"signatures":[{"autre":"champ"}],"data":[]}`,
		`{}`,
	}
	for _, corps := range cas {
		f := fixtureAPI{Etag: `"x"`, Corps: json.RawMessage(corps)}
		srv := serveurAPI(t, map[string]fixtureAPI{"/bot-signatures": f}, nil)

		c := cacheDeTest(srv.URL)
		avant, _ := c.get()
		c.refreshBotSignatures()
		apres, _ := c.get()

		if len(apres) != len(avant) {
			t.Fatalf("corps %s : repli écrasé (%d → %d)", corps, len(avant), len(apres))
		}
		srv.Close()
	}
}

// ─────────────────────────────────────────────────────────────────────
// La fixture doit rester conforme au contrat documenté
// ─────────────────────────────────────────────────────────────────────

func TestContratFixtureContientLesDeuxFormes(t *testing.T) {
	f := chargerFixture(t, "api_bot_signatures.json")

	var corps map[string]json.RawMessage
	if err := json.Unmarshal(f.Corps, &corps); err != nil {
		t.Fatalf("corps invalide: %v", err)
	}
	for _, cle := range []string{"signatures", "data", "meta"} {
		if _, ok := corps[cle]; !ok {
			t.Fatalf("clé %q absente : le contrat de rétrocompatibilité est rompu", cle)
		}
	}
	if !strings.HasPrefix(f.Etag, `"`) {
		t.Fatalf("ETag mal formé: %s", f.Etag)
	}
}
