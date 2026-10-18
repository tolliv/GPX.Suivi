"http://localhost:63342/GPX.Suivi/index.html?_ijt=gjjjh6dqg8ehsrto5l455a64np&_ij_reload=RELOAD_ON_SAVE&usr=1768976714&url=https://mgogbhqpbqqxqhxyiwwy.supabase.co/rest/v1/table&key=sb_publishable_6uC_TPJTNLGmA3w1e2ZyXw_YgkaxjAM"
"https://tolliv.github.io/GPX.Suivi/index.html?usr=1768976714&url=https://mgogbhqpbqqxqhxyiwwy.supabase.co/rest/v1/table&key=sb_publishable_6uC_TPJTNLGmA3w1e2ZyXw_YgkaxjAM"
//==================================================================================================
// Fichier main
// Tag 2610.18b
//==================================================================================================
var gItineraire = [];
var gPositions = [];
var gDistanceTotaleItineraire = 0;
var gDistanceParcourue = 0;
var gCurrentZoom = 5;
var gCurrentCenter = [46.5397, 2.4303];
var gRafraichirEnCours = false;
var gMapInitialized = false;

//----- Démarrage de l'application -----
document.addEventListener('DOMContentLoaded', function()
{
  observer.observe(pid('divBottomContainer'));
});

//----- Observer sur le redimmensionnement -----
const observer = new ResizeObserver(() =>
{
  // Redimensionnement de divTopContainer
  const heightBottom = pid('divBottomContainer').offsetHeight;
  pid('divTopContainer').style.bottom = (heightBottom+1) + "px";

  // On peut afficher la carte maintenant
  if (gMapInitialized == false)
  {
    gMapInitialized = true;

    Run();
  }
});

//--------------------------------------------------------------------------------------------------
// Raccourci sur les éléments du DOM
//--------------------------------------------------------------------------------------------------
function pid(id)
{
  const element = document.getElementById(id);
  if (id == null)
    console.log("ID NULL (" + id + ")");
  return(element);
}

//--------------------------------------------------------------------------------------------------
// Sleep
//--------------------------------------------------------------------------------------------------
const sleep = ms => new Promise(res => setTimeout(res, ms));


//--------------------------------------------------------------------------------------------------
// Toggle plein écran
//--------------------------------------------------------------------------------------------------
function toggleFullScreen()
{
  if (!document.fullscreenElement)
  {
    // On demande le plein écran pour tout le document
    document.documentElement.requestFullscreen().catch(err =>
    {
      console.error(`Erreur : ${err.message}`);
    });
  }
  else
  {
    // On quitte le plein écran
    document.exitFullscreen();
  }
}

//--------------------------------------------------------------------------------------------------
// Charge un fichier GPX, l'analyse et extrait les coordonnées lat,lon,alt
//--------------------------------------------------------------------------------------------------
async function ButLoadClick()
{
  var lAvancement = 0;

  // Chargement
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.gpx';

  var content = null;
  input.onchange = e =>
  {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = e =>
    {
      content = e.target.result;
      lAvancement = 1;
    };
    reader.readAsText(file);
  };
  input.click();

  // Attente de la lecture du fichier
  while (lAvancement == 0)
  {
    await sleep(50);
  }

  // Parsing
  const {length, data} = parseGpxToCoords(content);
  if (length != 0)
  {
    console.log(length + " points");
    lAvancement = 2;
  }
  else
  {
    console.log("Erreur fichier");
    lAvancement = 3;
  }

  // Ecriture dans la base de données par bloc de 1000 points
  const t0 = performance.now();
  const batchSize = 1000;
  var lStatus;
  for (let i = 0; i < data.length; i += batchSize)
  {
    // Découpage
    const chunk = data.slice(i, i + batchSize);

    // Envoi du paquet
    lStatus = await SupabaseWrite(chunk);
    if (lStatus !== "OK")
      break;

    console.log("Progression : " + i);
  }
  const delta = Math.round(0.100*(performance.now() - t0))/100;
  console.log("Ecriture " + lStatus + " (" + delta + "s)");
}


//--------------------------------------------------------------------------------------------------
// Analyse le contenu XML d'un fichier GPX pour en extraire les points
//--------------------------------------------------------------------------------------------------
function parseGpxToCoords(xmlContent)
{
  var lNb = 0;
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlContent, "text/xml");
  const trackPoints = xmlDoc.querySelectorAll("trkpt");
  const coords = [];

  trackPoints.forEach(pt => {
    const lat = parseFloat(pt.getAttribute("lat"));
    const lon = parseFloat(pt.getAttribute("lon"));
    var alt = parseFloat(pt.getAttribute("alt"));

    if (isNaN(alt))
      alt = 0;

    if (!isNaN(lat) && !isNaN(lon))
    {
      const lDate = DateSupabase();   // Même date pour tous les points
      coords.push({ user:USER,
                    date:lDate,
                    type:0,           // Itinéraire
                    lat:lat,
                    lon:lon,
                    alt:alt,
                    prec:0,
                    poi:0,
                    msg:""
                    });
      lNb++;
    }
  });
  return{length:lNb, data:coords};
}


//--------------------------------------------------------------------------------------------------
// Détection mode Admin ou Famille
//--------------------------------------------------------------------------------------------------
async function Run()
{
  let usrParam = "";
  let keyParam = "";
  let urlParam = "";

  // Récupération paramètres ligne d'adresse
  const queryString = window.location.search;
  const lineParams = new URLSearchParams(queryString);

  // Vérification si les paramètres existent et sont valides
  // USER
  if (lineParams.has("usr"))
  {
    usrParam = lineParams.get("usr");
    if ( (usrParam == "1768976714") || (usrParam == "1785819725") )
      USER = usrParam;
  }

  // URL
  if (lineParams.has("url"))
  {
    urlParam = lineParams.get("url");
    if (urlParam.includes('https:'))
      API_URL = urlParam;
  }

  // KEY
  if (lineParams.has("key"))
  {
    keyParam = lineParams.get("key");
    if (keyParam.includes('sb_publishable'))
      API_KEY = keyParam;
  }

  // Si tous les paramètres sont valides
  // Mode Famille directement sinon on permet le choix du mode
  if ( (USER != "?") && (API_URL != "?") && (API_KEY != "?") )
    ModeCommun();
  else
    ChoixDuMode();
}


//--------------------------------------------------------------------------------------------------
// Passage en mode Choix du mode
//--------------------------------------------------------------------------------------------------
async function ChoixDuMode()
{
  var txtUsrLocal = "";
  var txtUrlLocal = "";
  var txtKeyLocal = "";

  console.log("Choix du mode");

  // Lecture du local storage
  if (localStorage.getItem('GPXSuivi_usr') != null)
    txtUsrLocal = localStorage.getItem('GPXSuivi_usr');
  if (localStorage.getItem('GPXSuivi_url') != null)
    txtUrlLocal = localStorage.getItem('GPXSuivi_url');
  if (localStorage.getItem('GPXSuivi_key') != null)
    txtKeyLocal = localStorage.getItem('GPXSuivi_key');

  // Les valeurs sont données par la ligne d'adresse si existantes
  pid('txtUsr').value = txtUsrLocal;
  pid('txtUrl').value = txtUrlLocal;
  pid('txtKey').value = txtKeyLocal;
  pid('txtAdmin').innerHTML  = "Entrer les informations de connexion.";
  pid('divAdmin').style.display = 'block';
}

//--------------------------------------------------------------------------------------------------
// Valider les informations de connexion
//--------------------------------------------------------------------------------------------------
function ValiderAdmin()
{
  let flagOk = false;

  USER = pid('txtUsr').value;
  API_URL = pid('txtUrl').value;
  API_KEY = pid('txtKey').value;

  if ((USER != "") && (USER != "?")
   && (API_URL != "") && (API_URL != "?")
   && (API_KEY != "") && (API_KEY != "?"))
  {
    if (VerifieAccesBase() == "OK")
      flagOk = true;
  }

  // Si on peut accéder à la base de données
  if (flagOk == true)
  {
    // Sauvegarde dans le local storage
    localStorage.setItem('GPXSuivi_usr', USER);
    localStorage.setItem('GPXSuivi_url', API_URL);
    localStorage.setItem('GPXSuivi_key', API_KEY);

    // Lancement du mode commun
    pid('divAdmin').style.display = 'none';
    ModeCommun();
  }

  // Problème d'accès
  else
  {
    pid('txtValiderErreur').innerHTML = "Erreur d'accès à la base de données";
  }
}

//--------------------------------------------------------------------------------------------------
// Vérifie l'accès à la base de données
//--------------------------------------------------------------------------------------------------
function VerifieAccesBase()
{
  return("OK");
}

//--------------------------------------------------------------------------------------------------
// Démarrage du mode commun
// Le mode Admin a plus d'icones que le mode Famille
//--------------------------------------------------------------------------------------------------
async function ModeCommun()
{

  // Chargement
  var lRetChargement = "";
  lRetChargement = await ChargementItineraire();
  console.log("Chargement statut : " + lRetChargement);

  // Chargement OK
  if (lRetChargement == "OK")
  {
    if (gItineraire.length > 0)
    {
      pid('divChargement').style.display = 'none';
      pid('divProgression').style.display = 'block';
      pid('divButtons').style.display = 'block';
      pid('map').style.display = 'block';
      pid('divBottomContainer').style.display = 'block';
      AfficheCarte();
      CreationMarqueurs('T');
      SimulationPoints();  // Pour le DEBUG
      AfficheRattachements();
      AfficheItineraire();
      AffichePositions();
      CalculeDistanceTotaleEtParcourue();
      AfficheProgression();
    }
    else
    {
      console.log("Aucun point");
    }
  }
  else
  {
    console.log("Erreur chargement");
  }
}


//--------------------------------------------------------------------------------------------------
// Chargement de l'itinéraire
// Retourne un status
//--------------------------------------------------------------------------------------------------
async function ChargementItineraire()
{
  var lRet = "";

  // Nom du randonneur
  pid('spanNom').innerHTML = "Thierry";
  pid('spanNom').style.opacity = '1';

  var htmlInt = "";
  var longueurItineraire = 0;
  var longueurPrev = 0;

  pid('divChargement').style.display = 'block';

  console.log("Chargement itinéraire..");
  htmlInt = "<b>Chargement des informations</b><br>";
  pid('divChargement').innerHTML = htmlInt;

  // Compte le nombre de points avant de les charger
  const lCmd = "user=eq." + USER
             + "&type=eq.0"
             + "&order=id.asc"
             + "&limit=0";        // Ne charge rien
  var { status, count } = await SupabaseCount(lCmd);
  if (status == "OK")
  {
    longueurItineraire = count;
    console.log("Nombre de points : " + longueurItineraire);
    htmlInt += "Itinéraire 1 (" + longueurItineraire + " points) : ";
    pid('divChargement').innerHTML = htmlInt + "0%";

    if (longueurItineraire > 0)
    {
      gItineraire = [];
      let offset = 0;

      // Limitation par GET
      const batchSize = 1000;
      while (1)
      {
        const lCmd = "user=eq." + USER
                   + "&type=eq.0"
                   + "&order=id.asc"
                   + "&offset=" + offset
                   + "&limit=" + batchSize;
        var { status, length, data } = await SupabaseRead(lCmd);

        // Si erreur
        if (status != "OK")
          break;

        // Si OK
        else
        {
          // Nouveaux points
          if (length > 0)
          {
            gItineraire = gItineraire.concat(data);
            console.log("Chargés : " + gItineraire.length + " points...");
            for (let x = longueurPrev; x < gItineraire.length; x++)
            {
              pid('divChargement').innerHTML = htmlInt + "<b>"+ Math.round(100*x/longueurItineraire) + "%</b>";
            }
            await sleep(50);
            longueurPrev = gItineraire.length;

            // Sinon, on continue avec la prochaine page
            offset += batchSize;
           }

          // Fin du chargement
           else
              break;
        }
      }

      // Fin du chargement
      if (status !== "OK")
        console.log(status);
      else
        console.log("OK " + gItineraire.length + " points");
      lRet = status;
    }
  }
  else
    lRet = status;
  return(lRet);
}

//--------------------------------------------------------------------------------------------------
// Activation/Désactivation d'unbouton
// Blanc sur fond gris
//--------------------------------------------------------------------------------------------------
function BoutonEtat(bouton, etat)
{
  const but = pid(bouton);
  if (etat == 'actif')
    but.style.backgroundColor = '#444'  ,  but.style.color = '#FFF';

  if (etat == 'inactif')
    but.style.backgroundColor = '#FFF'  ,  but.style.color = '#000';
}


//--------------------------------------------------------------------------------------------------
// Met à jour la position du randonneur sur la barre
//--------------------------------------------------------------------------------------------------
async function AfficheProgression()
{
  // Distances
  const lParcourue = Math.floor(gDistanceParcourue*10)/10;
  const lTotale = Math.floor(gDistanceTotaleItineraire*10)/10;
  const lRestant = Math.floor((lTotale-lParcourue)*10)/10;
  const lPourcentage = Math.floor(lParcourue*100/lTotale);
  pid('spanDistanceMin').innerHTML = "0km";
  pid('spanDistanceMax').innerHTML = lTotale + "km";

  var p = Math.max(0, Math.min(100, lPourcentage));

  // Barre de progression
  pid('progression-fill').style.width = p + '%';

  // Position sur la barre de progression
  pid('imgCurseur').style.opacity = '1';
  pid('imgCurseur').style.left = p + '%';

  // Si <> 0, On attend la fin de déplacement de la position pour afficher la date
  var flagFini = false;
  if (p > 0)
  {
    pid('imgCurseur').addEventListener('transitionend', () =>
    {
      flagFini = true;
    }, { once: true });
  }
  else
    flagFini = true;

  // Attend la fin de l'animation s'il y en a, maximum 1.5 seconde
  var count = 0;
  for (count = 0; count < 15; count++)
  {
    if (flagFini == true)
      break;
    await sleep(100);
  }

  // Texte date et heure au-dessus
  const lDate = "<b>Aujourd'hui</b><br>18h15";
  pid('txtHeurePosition').innerHTML = lDate;

  const containerWidth = pid('progression-container').offsetWidth;
  const minPx = 42;
  const maxPx = containerWidth-42;

  // Conversion du pourcentage p en pixels
  let targetPx = (p / 100) * containerWidth;

  // On contraint la position (Clamp)
  if (targetPx < minPx) targetPx = minPx;
  if (targetPx > maxPx) targetPx = maxPx;

  // On applique la position en pixels
  pid('txtHeurePosition').style.left = targetPx + 'px';
  pid('txtHeurePosition').style.opacity = '1';

  pid('divDistances').innerHTML  = "Parcouru : <span class='classTexteLarge'><b>" + lParcourue + "</b></span> km";
  pid('divDistances').innerHTML += " -  Restant : <span class='classTexteLarge'><b>" + lRestant + "</b></span> km";

  // lPourcentage
  pid('divAvancement').innerHTML = p + "<small>%</small>";
  pid('divAvancement').style.opacity = '1';

  // Fin d'un éventuel rafraichissement en cours
  gRafraichirEnCours = false;

  // Bouton désactivé
  BoutonEtat('butRafraichir', 'inactif');
}

//--------------------------------------------------------------------------------------------------
// Calcule la distance totale et la distance parcourue
//--------------------------------------------------------------------------------------------------
function CalculeDistanceTotaleEtParcourue()
{
  gDistanceTotaleItineraire = 0;
  gDistanceParcourue = 0;
  const R = 6371;                                                   // Rayon moyen de la Terre en km

  if (gItineraire.length < 2) return;
  const dernierePosition = gPositions[gPositions.length - 1].numeroPointItineraire;;

  // Parcourt tous les points de l'itinéraire
  for (let i = 0; i < gItineraire.length - 1; i++)
  {
    const p1 = gItineraire[i];
    const p2 = gItineraire[i + 1];
    const dLat = (p2.lat - p1.lat) * Math.PI / 180;
    const dLon = (p2.lon - p1.lon) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(p1.lat * Math.PI / 180) * Math.cos(p2.lat * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;
    gDistanceTotaleItineraire += distance;

    // Position actuelle
    if (i == dernierePosition)
    {
      gDistanceParcourue = gDistanceTotaleItineraire;
    }
  }
}


//--------------------------------------------------------------------------------------------------
// Calcule une distance approximative mais très rapide pour les courtes distances.
// On retourne la distance au carré pour éviter la racine carrée (Math.sqrt)
//--------------------------------------------------------------------------------------------------
function calculeDistanceEntrePoints(p1, p2)
{
  // 111.32 km est la distance approximative d'un degré de latitude
  const ky = 111.32;

  // On ajuste la longitude en fonction de la latitude moyenne
  const kx = Math.cos(p1.lat * Math.PI / 180) * 111.32;
  const dx = (p1.lon - p2.lon) * kx;
  const dy = (p1.lat - p2.lat) * ky;
  return(dx * dx + dy * dy);
}

//--------------------------------------------------------------------------------------------------
// Affiche les rattachements des positions à l'itinéraire (point le plus proche)
//--------------------------------------------------------------------------------------------------
function AfficheRattachements()
{
  var indexPosition = 0;
  var distanceMin = Infinity;
  var indexLePlusProche = -1;

  // Pour chaque position mémorisée
  gPositions.forEach((pos) =>
  {
    distanceMin = Infinity;
    indexLePlusProche = -1;
    indexPosition++;

    //----- Définition des limites de recherche -----
    let lIndexStart, lIndexStop;
    // Cas début de la rando (entre le début et la moitié de l'itinéraire)
    if (pos.poi == 1)
      lIndexStart = 0  ,  lIndexStop = gItineraire.length/2;

    // Cas fin de la rando (entre la moitié de l'itinéraire et la fin)
    else if (pos.poi == 4)
      lIndexStart = gItineraire.length/2  ,  lIndexStop = gItineraire.length;

    // Cas des autres points (tout l'itinéraire)
    else
      lIndexStart = 0  ,   lIndexStop = gItineraire.length;

    // On cherche dans tout l'itinéraire le point le plus proche de la position actuelle
    for (let i = lIndexStart; i < lIndexStop; i++)
    {
      const d = calculeDistanceEntrePoints(pos, gItineraire[i]);
      if (d < distanceMin)
      {
        distanceMin = d;
        indexLePlusProche = i;
      }
    }

    // On stocke l'index trouvé
    pos.numeroItineraire = 0;                           // Numéro de l'itinéraire (pas encore utilisé)
    pos.numeroPointItineraire = indexLePlusProche;      // Numéro du point de l'itinéraire
    pos.distance = Math.sqrt(distanceMin);
    // console.log("Position " + indexPosition +" -> point " + indexLePlusProche + " (Dist: " + pos.distance.toFixed(3) + " km)");
  });
}

//--------------------------------------------------------------------------------------------------
// Rafraichir la carte, l'itinéraire et les points de suivi
//--------------------------------------------------------------------------------------------------
async function Rafraichir()
{
  // Uniquement si pas en cours
  if (gRafraichirEnCours == false)
  {
    gRafraichirEnCours = true;

    // Bouton activé
    BoutonEtat('butRafraichir', 'actif');

    // Mémorise vue actuelle
    gCurrentZoom = map.getZoom();
    gCurrentCenter = map.getCenter();

    // Remet les curseurs à 0 rapidement
    const backupTransitionBarre = pid('progression-fill').style.transition;
    const backupTransitionImage = pid('imgCurseur').style.transition;
    pid('progression-fill').style.transition = 'width 0s ease';
    pid('imgCurseur').style.transition = 'left 0s ease';
    pid('imgCurseur').style.left = '0%';
    pid('imgCurseur').style.opacity = '0';

    pid('txtHeurePosition').style.opacity = '0';
    pid('progression-fill').style.width = '0%';
    pid('divAvancement').style.opacity = 0;
    pid('divDistances').innerHTML = "&nbsp;";

    // Efface l'itinéraire et les marqueurs mais pas la carte
    map.eachLayer(function (layer)
    {
      // On ne supprime pas la couche de tuiles (TileLayer)
      if (layer instanceof L.Polyline || layer instanceof L.Marker || layer instanceof L.CircleMarker)
      {
        map.removeLayer(layer);
      }
    });

    // Attente pour que tout soit effacé
    await sleep(300);
    pid('progression-fill').style.transition = backupTransitionBarre;
    pid('imgCurseur').style.transition = backupTransitionImage;

    // Relire la base de données Position
    // TODO

    AfficheRattachements();
    AfficheItineraire();
    AffichePositions();
    CalculeDistanceTotaleEtParcourue();
    AfficheProgression();
  }
}


//--------------------------------------------------------------------------------------------------
// Choix du fond de carte
//--------------------------------------------------------------------------------------------------
function ChoixCarte()
{
  const menu = pid('menuChoixCarte');
  if (menu.style.display === 'none' || menu.style.display === '')
  {
    menu.style.display = 'block';
    BoutonEtat('butChoixCarte', 'actif');

    // Position du bouton
    const rect = pid('butChoixCarte').getBoundingClientRect();
    menu.style.top = rect.bottom + 6 + 'px';
    menu.style.left = rect.left + 'px';

    // Si le menu dépasse à droite de l'écran
    const menuRect = menu.getBoundingClientRect();
    if (menuRect.right > window.innerWidth)
        menu.style.left = (rect.right - menuRect.width) + 'px';
  }
  else
  {
    menu.style.display = 'none';
    BoutonEtat('butChoixCarte', 'inactif');
  }
}


//==================================================================================================


//--------------------------------------------------------------------------------------------------
// Simulation des points de suivi
//--------------------------------------------------------------------------------------------------
function SimulationPoints()
{
  const increment = Math.floor(gItineraire.length / 9);
  gPositions = [];
  var nb = 0;
  for (let i = 0; i < (gItineraire.length - 0*increment); i++)
  {
    if (i%increment == 0)
    {
      nb++;

      // Crée un nouvel élément
      var lLigne = {...gItineraire[i]};

      // POI
                   {lLigne.poi = 2; }
      if (nb == 1) {lLigne.poi = 1; lLigne.lat += 0.000; lLigne.lon -= 0.005;}
      if (nb == 6) {lLigne.poi = 3; lLigne.lat += 0.005;}

      msg  = "<b>15/10/2026 à " + (10+nb).toString() + "h15</b><br>";
      msg += "Altitude : " + (1000+nb).toString() + "m<br>";
      msg += "Coordonnées : " + lLigne.lat.toFixed(6) + "," + lLigne.lon.toFixed(6) + "<br>";
      msg += "Précision : 5m<br>";
      lLigne.msg = msg;

      gPositions.push(lLigne);
      if (nb == 8) break;
    }
  }
}