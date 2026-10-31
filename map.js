//==================================================================================================
// Gestion de la carte
// Tag 2610.18
//==================================================================================================

var map;
var IconeDebut;
var IconeFin;
var IconePosition;
var IconeBivouac;
var IconeRattachement;

//--------------------------------------------------------------------------------------------------
// Création d'une icone dynamique
//--------------------------------------------------------------------------------------------------
function createDynamicIcon(texte, couleurFront, couleurBack)
{
    const svgString = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
            <!-- Ajout de " " autour de ${couleurBack} -->
            <rect x="2" y="2" width="96" height="96" rx="15" fill="${couleurBack}" />
            <rect x="2" y="2" width="96" height="96" rx="15" fill="none" stroke="#FFF" stroke-width="4" />
            <!-- Ajout de " " autour de ${couleurFront} -->
            <text x="50" y="75" font-family="Arial, sans-serif" font-size="70" text-anchor="middle" fill="${couleurFront}">${texte}</text>
        </svg>`.trim();

    // Encodage en Base64 pour compatibilité cross-browser
    const svgBase64 = btoa(unescape(encodeURIComponent(svgString)));
    const iconUrl = 'data:image/svg+xml;base64,' + svgBase64;

    return L.icon({
      iconUrl: iconUrl,
      iconSize: [26, 26],
      iconAnchor: [13, 13],
      popupAnchor: [0, -13]
    });
}

//--------------------------------------------------------------------------------------------------
// Création des icones statiques
//--------------------------------------------------------------------------------------------------
function createStaticIcons()
{
  const svgString = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" width="10" height="10">
    <circle cx="5" cy="5" r="5" fill="#000" />
    <circle cx="5" cy="5" r="2" fill="#FFF" />
  </svg>`.trim();

  // Encodage en Base64 pour compatibilité cross-browser
  const svgBase64 = btoa(unescape(encodeURIComponent(svgString)));
  const iconUrl = 'data:image/svg+xml;base64,' + svgBase64;

  IconeRattachement = L.icon({
    iconUrl: iconUrl,
    iconSize: [10, 10],
    iconAnchor: [5, 5],
    popupAnchor: [0, -5],
  });
}

//--------------------------------------------------------------------------------------------------
// Affichage de la carte
//--------------------------------------------------------------------------------------------------
function AfficheCarte()
{
  // Affichage de la carte
  map = L.map('map').setView(gCurrentCenter, gCurrentZoom);
  SelectionnerFond('osm');
}

//--------------------------------------------------------------------------------------------------
// Affichage des boutons Dernière position, Toutes les positions
//--------------------------------------------------------------------------------------------------
function AfficherBoutonsPosition()
{
  const rect = pid('map').getBoundingClientRect();
  pid('panBoutonsPositions').style.top = (rect.top + 12) + 'px';
  pid('panBoutonsPositions').style.display = 'block';
}


//--------------------------------------------------------------------------------------------------
// Affichage de l'itinéraire
//--------------------------------------------------------------------------------------------------
function AfficheItineraire()
{
  // Création tableau pour la map
  if (gItineraire.length != 0)
  {
    const latLngs = [];
    const lLength = gItineraire.length;;
    for (let i = 0; i < lLength; i++)
    {
      const coord = [gItineraire[i].lat, gItineraire[i].lon];
      latLngs.push(coord);
    }

    var lastPosition;
    var indexCoupure;
    var cheminParcouru;
    var cheminRestant = latLngs;

    //-----  Si on a des points de position -----
    if (gPositions.length > 0)
    {
      // Dernier point de suivi
      lastPosition = gPositions[gPositions.length - 1];
      indexCoupure = lastPosition.numeroPointItineraire;
      cheminParcouru = latLngs.slice(0, indexCoupure + 1);
      cheminRestant = latLngs.slice(indexCoupure);

      // Affichage de la partie parcourue (Trait plein)
      const traceParcourue = L.polyline(cheminParcouru,
      {
          color: '#00F',
          weight: 4,
          opacity: 1
      }).addTo(map);
    }

    // Affichage de la partie restante (Pointillés)
    if (cheminRestant.length > 1) {
        const traceRestante = L.polyline(cheminRestant,
        {
            color: '#00F',
            weight: 4,
            opacity: 1,
            dashArray: '1, 8'
        }).addTo(map);
    }

    // Ajuste le zoom de la carte automatiquement pour englober toute la trace
    const bounds = L.polyline(latLngs).getBounds();
    map.fitBounds(bounds);
  }
}

//--------------------------------------------------------------------------------------------------
// Formate une chaîne de date
// Aujourd'hui, Hier, ou Date complète
//--------------------------------------------------------------------------------------------------
function FormaterDateRelative(dateStr)
{
  const d = dateStr.toString();

  // Extraction des segments
  const annee = 2000 + parseInt(d.substring(0, 2), 10);
  const moisIndex = parseInt(d.substring(2, 4), 10) - 1;
  const jour = parseInt(d.substring(4, 6), 10);
  const heure = parseInt(d.substring(6, 8), 10);
  const min = d.substring(8, 10);

  // Création de l'objet Date pour la comparaison (à minuit pour ignorer l'heure)
  const dateCible = new Date(annee, moisIndex, jour);

  const aujourdhui = new Date();
  aujourdhui.setHours(0, 0, 0, 0);

  const hier = new Date(aujourdhui);
  hier.setDate(aujourdhui.getDate() - 1);

  // Préparation de l'heure
  const heureFormattee = `${heure}h${min}`;

  // Comparaison
  if (dateCible.getTime() === aujourdhui.getTime())
    return { j:"Aujourd'hui", h:heureFormattee };

  else if (dateCible.getTime() === hier.getTime())
    return { j:"Hier", h:heureFormattee };

  else
  {
    const moisNoms = ["janv", "févr", "mars", "avr", "mai", "juin",
                      "juil", "août", "sept", "oct", "nov", "déc"];
    return { j:jour + " " + moisNoms[moisIndex] + " " + annee, h:heureFormattee };
  }
}

//--------------------------------------------------------------------------------------------------
// Affichage des points de suivi
//--------------------------------------------------------------------------------------------------
function AffichePositions()
{
  if (gPositions.length > 0)
  {
    const latLngsItineraire = gItineraire.map(p => [p.lat, p.lon]);
    let bounds = L.latLngBounds(latLngsItineraire);

    var nb=-1;
    gPositions.forEach(pos =>
    {
      nb++;

      // Création du marqueur
      var iconChoisie;
      if (pos.poi == 1)
        iconChoisie = IconeDebut;
      else if (pos.poi == 2)
        iconChoisie = IconePosition;
      else if (pos.poi == 3)
        iconChoisie = IconeBivouac;
      else if (pos.poi == 4)
        iconChoisie = IconeFin;
      else
        iconChoisie = IconePosition;

      // Suivant si on affiche tout ou seulement la dernière position
      if ( (gAffichagePositions == 'all') || ((gAffichagePositions == 'last') && (nb == gPositions.length-1)) )
      {
        // Icone rattachement sur l'itinéraire
        const latItineraire = gItineraire[pos.numeroPointItineraire].lat;
        const lonItineraire = gItineraire[pos.numeroPointItineraire].lon;
        const rattachement = L.marker([latItineraire, lonItineraire], {icon:IconeRattachement, zIndexOffset:-1000}).addTo(map);

        // Icone du POI
        const marker = L.marker([pos.lat, pos.lon], {icon:iconChoisie}).addTo(map);

        // Prend en compte les markers dans les limites
        bounds.extend([pos.lat, pos.lon]);

        // Récupération des données
        let lMsg = "";
        const lDate = FormaterDateRelative(pos.date.toString());
        lMsg += "<b>" + lDate.j + " à " + lDate.h + "</b><br>";
        lMsg += "(" + pos.lat + "," + pos.lon + ")<br>";
        lMsg += "Alt: " + pos.alt + "m<br>";
        lMsg += "Précision: " + pos.prec + "m<br>";
        lMsg += "<span style='font-size: 11px;'><i>" + pos.msg + "</i></span>";

        // Création de la Bulle de presque la taille de l'écran
        const rect = pid('map').getBoundingClientRect();
        marker.bindPopup(lMsg,
        {
            className: 'custom-popup',
            maxWidth: rect.width*0.8,
            maxHeight: rect.height*0.8,
            closeButton: true,
            autoPan: false
        });
      }
    });

    // Englobe tout avec une marge
    if (bounds.isValid())
    {
        map.fitBounds(bounds, { padding: [10, 10] });
    }
  }
}


//--------------------------------------------------------------------------------------------------
// Définition des différents fonds de carte
//--------------------------------------------------------------------------------------------------
// Par défaut
const fondsDeCarte =
{
    'osm': L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'}),

    'topo': L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenTopMap contributors'}),

    'ignPlan': L.tileLayer('https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&FORMAT=image/png&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}', {
        attribution: '© IGN contributors'}),

    'satellite': L.tileLayer('https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&FORMAT=image/jpeg&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}', {
        attribution: '© IGN contributors'})
};
var coucheActuelle = fondsDeCarte['osm'];

//--------------------------------------------------------------------------------------------------
// Affichage du fond de carte
// const map = L.map('map').setView([46.603354, 1.888334], 6);
// coucheActuelle.addTo(map);
//--------------------------------------------------------------------------------------------------
function SelectionnerFond(nomFond)
{
    // Vérifier si le fond demandé existe
    const nouveauFond = fondsDeCarte[nomFond];
    if (!nouveauFond) return;

    // Retirer la couche actuelle
    map.removeLayer(coucheActuelle);

    // Ajouter la nouvelle couche
    nouveauFond.addTo(map);

    // Mettre à jour la référence
    coucheActuelle = nouveauFond;

    // Fermer le menu après sélection
    pid('panChoixCarte').style.display = 'none';
    BoutonEtat('butChoixCarte', 'inactif');
}