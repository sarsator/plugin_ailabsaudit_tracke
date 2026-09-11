# Pilote « Shopify AI Agent Monitor » — document de participation

*AI Labs Audit · version 1.0 · [DATE]*

## Pourquoi nous vous sollicitons

Nous testons une fonctionnalité expérimentale permettant d'observer si des agents d'intelligence artificielle — ceux qui alimentent ChatGPT, Claude, Perplexity et leurs équivalents — consultent des points d'entrée publiés sur une boutique Shopify.

Il faut être précis sur ce que cela n'est pas. **Nous ne voyons pas les pages de votre boutique qui sont explorées.** Shopify ne le permet pas, et nous ne le prétendons pas. Nous observons uniquement les appels adressés à une adresse technique que notre application publie sur votre boutique. C'est une mesure de faisabilité, rien de plus.

## Durée

Le pilote est prévu du **[DATE DE DÉBUT]** au **[DATE DE FIN ESTIMÉE]**, soit environ **[DURÉE]**. Vous pouvez y mettre fin à tout moment, sans justification et sans préavis.

## Ce qui est installé

Une application Shopify de test AI Labs Audit, qui ajoute :

- un **App Embed** — un composant rendu par les serveurs de Shopify, que vous activez et désactivez depuis votre éditeur de thème ;
- un **App Proxy** — une adresse technique servie sous votre domaine, qui reçoit les appels à mesurer.

Dans le déroulement normal, **aucune modification manuelle et permanente du code de votre thème n'est nécessaire.**

## Les deux variantes

Votre boutique recevra l'une de ces deux configurations, ou les deux successivement :

**Variante H — invisible.** Une référence technique est ajoutée dans le `<head>` de vos pages. Elle ne modifie en rien l'affichage : un visiteur ne voit aucune différence.

**Variante B — visible.** Un lien discret est affiché sur votre boutique, généralement en bas de page, pointant vers une ressource destinée aux agents IA. **Ce lien est visible par vos visiteurs.** Nous le signalons explicitement, car c'est le seul élément du pilote qui change l'apparence de votre boutique.

S'y ajoute une **adresse témoin**, publiée mais référencée nulle part : elle sert à mesurer le bruit de fond des robots qui devinent des adresses au hasard. Elle n'est visible nulle part et ne change rien à votre boutique.

Si vous acceptez les deux variantes, la configuration pourra alterner entre elles pendant le test, afin de comparer leur capacité à être repérées par des agents IA.

## Vous pouvez refuser la variante visible

Vous pouvez participer **uniquement en variante H**, sans aucun lien visible. C'est une option pleinement légitime, prévue par le protocole, et ce choix ne réduit en rien l'intérêt de votre participation.

## Ce que nous mesurons

À chaque appel reçu sur l'adresse technique : l'horodatage, la boutique concernée, le chemin appelé, le User-Agent déclaré, l'identifiant et la catégorie de l'agent lorsqu'il est reconnaissable, et la variante active.

## Ce que nous ne collectons pas

- Aucune donnée de vos clients.
- Aucun contenu de commande.
- Aucune donnée de paiement.
- Aucune donnée personnelle de vos visiteurs n'est utilisée pour le pilote.
- **Aucune adresse IP n'est conservée.**

Sur ce dernier point, soyons exacts : l'adresse IP peut être utilisée temporairement, en mémoire, afin de vérifier l'identité déclarée d'un robot lorsqu'une plage d'adresses officielle est disponible. **L'adresse IP brute n'est pas conservée. Seul le résultat de cette vérification peut être enregistré.**

## Ce que le pilote n'apporte pas

Nous n'attendons aucun effet sur vos ventes, ni sur la vitesse perçue de votre boutique. Aucune modification de vos règles de référencement ou de votre `robots.txt` n'est prévue.

**Nous ne garantissons aucune amélioration de votre visibilité auprès des intelligences artificielles.** Il s'agit d'une expérimentation de mesure, pas d'une prestation d'optimisation.

## Arrêt et retrait

Vous pouvez à tout moment désactiver l'App Embed depuis votre éditeur de thème, désinstaller l'application, ou nous demander de retirer votre boutique du pilote. **Cela n'a aucune conséquence sur votre compte AI Labs Audit**, ni sur les prestations dont vous bénéficiez par ailleurs.

## Après la désinstallation

La désactivation interrompt l'affichage ; la désinstallation coupe l'adresse technique. Shopify peut conserver des références techniques de configuration dans votre thème après la désinstallation. Elles n'affectent ni l'affichage ni le référencement, mais AI Labs Audit vous accompagnera si vous souhaitez un nettoyage manuel.

## Confidentialité des résultats

Les résultats propres à votre boutique restent confidentiels, sauf accord de votre part. Des résultats agrégés et anonymisés pourront être utilisés dans l'analyse du pilote. **Aucun nom de boutique ne sera publié sans votre autorisation explicite.**

## Contact

AI Labs Audit — AI Labs Solutions · [EMAIL CONTACT PILOTE] · [TÉLÉPHONE]

---

## Formulaire de réponse

**1 — Participation**

☐ J'accepte de participer au pilote Shopify AI Agent Monitor pour la boutique **[NOM / DOMAINE]**.

**2 — Choix de configuration** *(une seule réponse)*

☐ J'accepte les deux variantes, **y compris la variante B avec lien visible** sur ma boutique.
☐ Je participe **uniquement en variante H**, sans aucun lien visible.

**3 — Option**

☐ Je souhaite être prévenu avant tout changement visible sur ma boutique.
*(sans objet si vous avez choisi la variante H seule)*

Nom · Fonction · Date · Signature
Contact technique pour l'installation : ________________
