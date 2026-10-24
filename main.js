// &usr=124991&url=https://mgogbhqpbqqxqhxyiwwy.supabase.co/rest/v1/table&key=sb_publishable_6uC_TPJTNLGmA3w1e2ZyXw_YgkaxjAM&admin=1
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
var gModeAdmin = false;
var gAffichagePositions = 'last';
var gPrenom = "";
var gNomItineraire = "(aucun itinéraire)";

//----- Démarrage de l'application -----
document.addEventListener('DOMContentLoaded', function()
{
  observer.observe(pid('panBottomContainer'));
});

//----- Observer sur le redimmensionnement -----
const observer = new ResizeObserver(() =>
{
  // Redimensionnement de panTopContainer
  const heightBottom = pid('panBottomContainer').offsetHeight;
  pid('panTopContainer').style.bottom = (heightBottom+1) + "px";

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
  if (element == null)
    console.log("Element NULL (" + id + ")");
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

  // Evènement de chargement du fichier
  input.onchange = e =>
  {
    const file = e.target.files[0];

    // Pas de fichier choisi
    if (!file)
    {
      lAvancement = 4;
    }

    // Fichier choisi
    else
    {
      const reader = new FileReader();
      reader.onload = e =>
      {
        content = e.target.result;
      };
      pid('txtAdminNbPoints').innerHTML = "Lecture en cours ..";
      reader.readAsText(file);

      // Nom de fichier sans l'extension
      gNomItineraire = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
      lAvancement = 1;
    }
  };

  // Gestion de l'annulation (si l'utilisateur ferme la fenêtre sans choisir)
  input.oncancel = () =>
  {
    lAvancement = 2;
  };
  input.click();

  // Attente de la lecture du fichier
  while (lAvancement == 0)
  {
    await sleep(50);
  }

  // Si un fichier a été choisi
  if (lAvancement == 1)
  {
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


    // Effacement de l'itinéraire actuellement dans la base de données
    lStatus = await SupabaseEffaceItineraire();

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

      console.log("Load progression : " + i);
    }

    // Ecriture du Nom de l'itinéraire dans la base de données
    lStatus = await SupabaseWriteNomItineraire();
    const delta = Math.round(0.100*(performance.now() - t0))/100;
    console.log("Ecriture " + lStatus + " (" + delta + "s)");
  }

  // Pas de fichier choisi
  else
  {
    console.log("Pas de fichier choisi");
  }
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
  let admParam = "";

  // Récupération paramètres ligne d'adresse
  const queryString = window.location.search;
  const lineParams = new URLSearchParams(queryString);

  //----- Vérification si les paramètres existent et sont valides -----
  // USER
  if (lineParams.has("usr"))
  {
    usrParam = lineParams.get("usr");
    let quotient = Number(usrParam) / 124991;
    if (usrParam == "1768976714")
      quotient = 1;
    if ( (quotient >= 1) && (quotient <= 8) && (quotient%1 == 0) )
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

  // ADMIN
  if (lineParams.has("admin"))
  {
    admParam = lineParams.get("admin");
    if (admParam == "1")
      gModeAdmin = true;
  }

  // Si tous les paramètres sont valides
  // Mode Famille directement sinon on affiche le panel des informations de connexion
  if ( (USER != "?") && (API_URL != "?") && (API_KEY != "?") )
    ModeCommun();
  else
    InfosConnexion();
}


//--------------------------------------------------------------------------------------------------
// Affichage des informations de connexion
//--------------------------------------------------------------------------------------------------
async function InfosConnexion()
{
  var txtUsrLocal = "";
  var txtUrlLocal = "";
  var txtKeyLocal = "";

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
  pid('panAdminConnexion').style.display = 'block';
}

//--------------------------------------------------------------------------------------------------
// Valider les informations de connexion
//--------------------------------------------------------------------------------------------------
async function ValiderAdmin()
{
  let flagOk = false;

  USER = pid('txtUsr').value;
  API_URL = pid('txtUrl').value;
  API_KEY = pid('txtKey').value;

  // Validation
  let quotient = Number(USER) / 124991;
  if (USER == 1768976714)
    quotient = 1;

  // Vérifications
  do
  {
    if ( (API_URL == "") || (!API_URL.includes('https:')) )
    {
      pid('txtValiderErreur').innerHTML = "Erreur sur l'adresse URL";
      break;
    }
    if ( (API_KEY == "") || (API_KEY == "?") || (!API_KEY.includes('sb_publishable')) )
    {
      pid('txtValiderErreur').innerHTML = "Erreur sur la clé";
      break;
    }
    if ( (USER == "") || (USER == "?") )
    {
      pid('txtValiderErreur').innerHTML = "Erreur sur le numéro d'utilisateur";
      break;
    }
    if ( (quotient < 1) || (quotient > 8) )
    {
      pid('txtValiderErreur').innerHTML = "Erreur, Numéro d'utilisateur non autorisé";
      break;
    }
    if (quotient%1 !=0)
    {
      pid('txtValiderErreur').innerHTML = "Erreur, Numéro d'utilisateur non autorisé";
      break;
    }

    if (await VerifieAccesBase() != "OK")
      break;

    // Sauvegarde dans le local storage
    localStorage.setItem('GPXSuivi_usr', USER);
    localStorage.setItem('GPXSuivi_url', API_URL);
    localStorage.setItem('GPXSuivi_key', API_KEY);

    // Active le mode admin puisqu'on vient de valider les paramètres
    pid('panAdminConnexion').style.display = 'none';
    gModeAdmin = true;
    ModeCommun();
  } while (0);
}

//--------------------------------------------------------------------------------------------------
// Vérifie l'accès à la base de données
//--------------------------------------------------------------------------------------------------
async function VerifieAccesBase()
{
  pid('txtValiderErreur').innerHTML = "";
  await sleep(100);
  pid('txtValiderErreur').innerHTML = "<b>Vérification de la base de données : </b>";
  let status = await SupabaseTestConnexion();

  // Aller ligne suivante si erreur (car texte long)
  if (status != "OK")
    status = "<br>" + status;
  pid('txtValiderErreur').innerHTML += status;
  await sleep(500);
  return(status);
}


//--------------------------------------------------------------------------------------------------
// Prépare l'IHM pour passer en Admin (visibilité des boutons)
//--------------------------------------------------------------------------------------------------
function PasseAdminOn()
{
  pid('butAdmin').style.display = 'inline-block';
}
function PasseAdminOff()
{
  pid('butAdmin').style.display = 'none';
}

//--------------------------------------------------------------------------------------------------
// Ajoute un 's' ou non à un texte
//--------------------------------------------------------------------------------------------------
function S(nombre, texte)
{
  let textefinal = nombre;
  textefinal += " " + texte;
  if (nombre > 1)
    textefinal += "s";
  return(textefinal);
}


//--------------------------------------------------------------------------------------------------
// Démarrage du mode commun
// Avec le bouton Admin si on vient de valider les informations de connexion
//--------------------------------------------------------------------------------------------------
async function ModeCommun()
{
  // Affichage du panneau de chargement
  pid('panChargement').style.display = 'block';

  // Prénom et marqueurs
  const lecturePrenom = SupabaseReadPrenom();
  if (lecturePrenom.status == "OK" && lecturePrenom.length > 0)
    gPrenom = lecturePrenom.data;
  else
    gPrenom = "Toto";
  CreationMarqueurs();

  // Nom du randonneur
  pid('spanNom').innerHTML = "<b>" + gPrenom + "</b>";
  pid('spanNom').style.opacity = '1';

  // Lecture du nom de l'itinéraire
  lStatus = await SupabaseReadNomItineraire();

  // Chargement
  var lRetChargement = "";
  lRetChargement = await ChargementItineraire();
  console.log("Chargement statut : " + lRetChargement);

  // Chargement OK
  if (lRetChargement == "OK")
  {
    // On efface les panels de démarrage et de chargement
    pid('panDemarrage').style.display = 'none';
    pid('panChargement').style.display = 'none';

    // Tous les boutons inactif
    BoutonEtat('butRafraichir', 'inactif');
    BoutonEtat('butPartager', 'inactif');
    BoutonEtat('butAdmin', 'inactif');

    // Afficher le panel principal
    pid('panAffichagePrincipal').style.display = 'flex';

    AfficheCarte();
    AfficherBoutonsPosition();

// gItineraire = []; // DEBUG

    if (gItineraire.length > 0)
    {
      SimulationPoints();  // Pour le DEBUG
      AfficheRattachements();
      AfficheItineraire();
    }

    AffichePositions();
    if (gItineraire.length > 0)
    {
      CalculeDistanceTotaleEtParcourue();
      AfficheProgression();
    }

    if (gModeAdmin)
      PasseAdminOn();
  }
  else
  {
    console.log("Erreur chargement");
    // TODO
  }

//  ButAdminClick(); // DEBUG
}


//--------------------------------------------------------------------------------------------------
// Chargement de l'itinéraire depuis la base de données
// Retourne un status
//--------------------------------------------------------------------------------------------------
async function ChargementItineraire()
{
  var lRet = "";
  var htmlInt = "";
  var longueurItineraire = 0;
  var longueurPrev = 0;

  pid('panChargement').style.display = 'block';

  console.log("Chargement itinéraire..");
  htmlInt = "<br><b>Chargement des informations</b><br>";
  pid('panChargement').innerHTML = htmlInt;

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
    pid('panChargement').innerHTML = htmlInt + "0%";

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
              pid('panChargement').innerHTML = htmlInt + "<b>"+ Math.round(100*x/longueurItineraire) + "%</b>";
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

    // Aucun point mais ce n'est pas une erreur
    else
      lRet = "OK";
  }
  else
    lRet = status;
  return(lRet);
}

//--------------------------------------------------------------------------------------------------
// Chargement de l'itinéraire depuis la base de données - en mode Admin
// Retourne un status
//--------------------------------------------------------------------------------------------------
async function ChargementItineraireAdmin()
{
  var lRet = "";
  var htmlInt = "";
  var longueurItineraire = 0;

  console.log("Chargement itinéraire admin..");

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
            pid('txtAdminNbPoints').innerHTML = S(gItineraire.length, "point");

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

    // Aucun point mais ce n'est pas une erreur
    else
      lRet = "OK";
  }
  else
    lRet = status;

  pid('txtAdminNbPoints').innerHTML = S(gItineraire.length, "point");
  return(lRet);
}


//--------------------------------------------------------------------------------------------------
// Activation/Désactivation d'un bouton
//--------------------------------------------------------------------------------------------------
function BoutonEtat(bouton, etat)
{
  const but = pid(bouton);
  if (etat == 'actif')
  {
    but.style.backgroundColor = '#FFF';
    but.style.color = '#000';
    but.style.border = '2px solid #4F4';
    but.state = 'actif';
  }

  if (etat == 'inactif')
  {
    but.style.backgroundColor = '#444';
    but.style.color = '#FFF';
    but.style.border = '2px solid #444';
    but.state = 'inactif';
  }
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
  pid('txtPourcentage').innerHTML = p + "<small>%</small>";
  pid('txtPourcentage').style.opacity = '1';

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
    pid('txtPourcentage').style.opacity = 0;
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
  // Menu non affiché, on l'affiche
  const menu = pid('panChoixCarte');
  if (pid('butChoixCarte').state != 'actif')
  {
    BoutonEtat('butChoixCarte', 'actif');
    const rect = pid('panButtonsMenu').getBoundingClientRect();
    menu.style.display = 'block';
    menu.style.top = rect.bottom + 'px';
    menu.style.left = '10px';

    // Si le menu dépasse à droite de l'écran
    const menuRect = menu.getBoundingClientRect();
    if (menuRect.right > window.innerWidth)
        menu.style.left = (rect.right - menuRect.width) + 'px';
  }

  // Masquage du menu
  else
  {
    menu.style.display = 'none';
    BoutonEtat('butChoixCarte', 'inactif');
  }
}


//--------------------------------------------------------------------------------------------------
// Partager l'adresse du site
//--------------------------------------------------------------------------------------------------
function Partager()
{
  const msg = "Suivez mon parcours sur GPX.Suivi :";
  const texte = "https://tolliv.github.io/GPX.Suivi/index.html?"
            + "usr=" + USER
            + "&url=" + API_URL
            + "&key=" + API_KEY;

  BoutonEtat('butPartager', 'actif');
  setTimeout(() => {
    BoutonEtat('butPartager', 'inactif');
  }, 500);

  if (navigator.share)
  {
    navigator.share(
    {
      title: "GPX.Suivi",
      text: msg,
      url: texte
    })
    .then(() => console.log("Partage réussi"))
    .catch((error) => console.log("Erreur de partage", error));
  }
  else
  {
    // On crée une simple boîte de dialogue avec prompt (natif et rapide)
    // Ou on peut utiliser une zone de texte dédiée dans le HTML
    // Utilisation du presse-papier si disponible
    if (navigator.clipboard)
    {
      navigator.clipboard.writeText(url).then(() =>
      {
        alert("Lien copié dans le presse-papier !\n\n" + texte);
      }).catch(() =>
      {
        // Si la copie automatique échoue, on affiche le lien pour copie manuelle
        window.prompt(msg, texte);
      });
    } else
    {
      window.prompt(msg, texte);
    }
  }
}

//--------------------------------------------------------------------------------------------------
// Choix de l'affichage de la position
//--------------------------------------------------------------------------------------------------
function SelectionnerChoixPosition(choix)
{
  let lRefresh = false;
  if (choix == 'last')
  {
    gAffichagePositions = 'last';
    lRefresh = true;
  }
  if (choix == 'all')
  {
    gAffichagePositions = 'all';
    lRefresh = true;
  }

  // Si on doit rafraichir
  if (lRefresh)
  {
    // Efface les marqueurs mais pas la carte ni l'itinéraire
    map.eachLayer(function (layer)
    {
      if (layer instanceof L.Marker)
      {
        map.removeLayer(layer);
      }
    });
    AffichePositions();
  }
}


//========== COMMANDES ADMIN =======================================================================


//--------------------------------------------------------------------------------------------------
// Affiche les commandes admin
//--------------------------------------------------------------------------------------------------
function ButAdminClick()
{
  const but = pid('butAdmin');
  const pan = pid('panAdminCommandes');

  // Il était inactif, on l'active
  if (but.state != 'actif')
  {
    //----- Remplissage des champs avant l'affichage -----
    // Nb Points
    pid('txtAdminNbPoints').innerHTML = S(gItineraire.length, "point");

    // Nom itinéraire
    pid('txtAdminNomItineraire').value = gNomItineraire;

    // Prénom
    pid('txtAdminPrenom').value = gPrenom;

    //----- Le reste -----
    // Etat du bouton et positionnement du panel
    BoutonEtat('butAdmin', 'actif');
    const rect = pid('panButtonsMenu').getBoundingClientRect();
    pan.style.top = rect.bottom + 'px'; // Sous le menu
    pan.style.display = 'block';
  }

  // Il était actif, on le désactive
  else
  {
    BoutonEtat('butAdmin', 'inactif');
    pan.style.display = 'none';
  }
}

//--------------------------------------------------------------------------------------------------
// Charger un itinéraire
//--------------------------------------------------------------------------------------------------
async function ButAdminChargerClick()
{
  // Chargement du fichier et écriture dans la base de données
  pid('txtAdminNbPoints').innerHTML = "Choisir le fichier ..";
  await ButLoadClick();

  // Chargement de l'itinéraire depuis la base de données
  gItineraire = [];
  lRetChargement = await ChargementItineraireAdmin();

  // Lecture du nom de l'itinéraire
  lStatus = await SupabaseReadNomItineraire();

  // Nouvelles valeurs (le nombre de points est affiché par ChargementItineraireAdmin()
  pid('txtAdminNomItineraire').value = gNomItineraire;
}


//--------------------------------------------------------------------------------------------------
// Modifier le nom de l'itinéraire
//--------------------------------------------------------------------------------------------------
async function ButAdminModifierNomClick()
{
  // Ecriture du nom de l'itinéraire dans la base de données
  gNomItineraire = pid('txtAdminNomItineraire').value;
  lStatus = await SupabaseWriteNomItineraire();

  // Relecture du nom de l'itinéraire
  lStatus = await SupabaseReadNomItineraire();

  // Nouvelle valeur
  pid('txtAdminNomItineraire').value = gNomItineraire;
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