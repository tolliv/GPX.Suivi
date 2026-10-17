//==================================================================================================
// Gestion de la carte
//==================================================================================================

var map;

// Définition de l'icône de Début
const IconDebut = L.icon({
    iconUrl: 'imgDebut.svg',
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -13]
});

// Définition de l'icône Position
const IconPosition = L.icon({
    iconUrl: 'imgPosition.svg',
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -13]
});

// Définition de l'icône LastPosition
const IconLastPosition = L.icon({
    iconUrl: 'imgLastPosition.svg',
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -13]
});

// Définition de l'icône Bivouac
const IconeBivouac = L.icon({
    iconUrl: 'imgBivouac.svg',
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -13]
});

// Définition de l'icône Rattachement
const IconeRattachement = L.icon({
    iconUrl: 'imgRattachement.svg',
    iconSize: [10, 10],
    iconAnchor: [5, 5],
    popupAnchor: [0, -5],
});


//--------------------------------------------------------------------------------------------------
// Affichage la carte
// Mode = 1 : Initialisation complète de la carte
// Mode = 0 : sans reinit.
//--------------------------------------------------------------------------------------------------
function AfficheCarte()
{
  // Affichage de la carte
  map = L.map('map').setView(gCurrentCenter, gCurrentZoom);

//  const planIGN = L.tileLayer('https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&FORMAT=image/png&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}', {
//    maxZoom: 19, attribution: '© <a href="https://www.ign.fr/">IGN</a>'

    const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);
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

    // Dernier point de suivi
    const lastPosition = gPositions[gPositions.length - 1];
    const indexCoupure = lastPosition.numeroPointItineraire;
    const cheminParcouru = latLngs.slice(0, indexCoupure + 1);
    const cheminRestant = latLngs.slice(indexCoupure);

    // Affichage de la partie parcourue (Trait plein)
    const traceParcourue = L.polyline(cheminParcouru, {
        color: '#00F',
        weight: 4,
        opacity: 1
    }).addTo(map);

    // Affichage de la partie restante (Pointillés)
    if (cheminRestant.length > 1) {
        const traceRestante = L.polyline(cheminRestant, {
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
        iconChoisie = IconDebut;
      else if (pos.poi == 2)
      {
        if (nb == (gPositions.length-1))
          iconChoisie = IconLastPosition;
        else
          iconChoisie = IconPosition;
      }
      else if (pos.poi == 3)
        iconChoisie = IconeBivouac;
      else
        iconChoisie = IconPosition;

      // Icone rattachement sur l'itinéraire
      const latItineraire = gItineraire[pos.numeroPointItineraire].lat;
      const lonItineraire = gItineraire[pos.numeroPointItineraire].lon;
      const rattachement = L.marker([latItineraire, lonItineraire], {icon:IconeRattachement, zIndexOffset:-1000}).addTo(map);

      // Icone du POI
      const marker = L.marker([pos.lat, pos.lon], {icon:iconChoisie}).addTo(map);

      // Prend en compte les markers dans les limites
      bounds.extend([pos.lat, pos.lon]);

      // Création de la Bulle
      marker.bindPopup(pos.msg,
      {
          className: 'custom-popup',
          maxWidth: 500,
          closeButton: false,
      });
    });

    // Englobe tout avec une marge
    if (bounds.isValid())
    {
        map.fitBounds(bounds, { padding: [10, 10] });
    }
  }
}
