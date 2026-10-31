// &usr=124991&url=https://mgogbhqpbqqxqhxyiwwy.supabase.co/rest/v1/table&key=sb_publishable_6uC_TPJTNLGmA3w1e2ZyXw_YgkaxjAM&admin=1
//==================================================================================================
// Fichier main
// Tag 2610.18b
//==================================================================================================
const NOM_ITINEAIRE_DEFAUT = "(aucun itinéraire)";
const PRENOM_DEFAUT = "Toto";
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
var gPrenom = PRENOM_DEFAUT;
var gNomItineraire = NOM_ITINEAIRE_DEFAUT;
var gDoitEtreRafraichi = false;

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
      lAvancement = 1; // Valeur de retour : OK */
    }
  };

  // Gestion de l'annulation (si l'utilisateur ferme la fenêtre sans choisir)
  input.oncancel = () =>
  {
    lAvancement = 4; // Valeur de retour : pas de fichier choisi */
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
      lAvancement = 2;  // Valeur de retour : OK pour le parsing */
    }
    else
    {
      console.log("Erreur fichier");
      lAvancement = 3;  // Valeur de retour : erreur de fichier */
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
    lStatus = await SupabaseWriteNomItineraire(gNomItineraire);
    const delta = Math.round(0.100*(performance.now() - t0))/100;
    console.log("Ecriture " + lStatus + " (" + delta + "s)");
  }

  // Pas de fichier choisi
  else
  {
    console.log("Pas de fichier choisi");
  }
  return(lAvancement);
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
  await LecturePrenom();
  console.log("Prénom = " + gPrenom);
  pid('txtPrenom').innerHTML = "<b>" + gPrenom + "</b>";
  pid('txtPrenom').style.opacity = '1';
  CreationMarqueurs();

  // Chargement Positions
  const lRetChargementPositions  = await ChargementPositions();

  // Lecture du nom de l'itinéraire
  await LectureNomItinéraire();
  console.log("Nom itinéraire = " + gNomItineraire);

  // Chargement itinéraire
  const lRetChargement = await ChargementItineraire();

  // Chargement OK
  if (lRetChargement == "OK")
  {
    // On efface les panels de démarrage et de chargement
    pid('panDemarrage').style.display = 'none';
    pid('panChargement').style.display = 'none';

    // Tous les boutons inactif
    InactivationBoutons();

    // Afficher le panel principal
    pid('panAffichagePrincipal').style.display = 'flex';

    AfficheCarte();
    pid('spanBottom').style.opacity = '1';
    AfficherBoutonsPosition();

    if (gItineraire.length > 0)
    {
      if (0) // Pour le DEBUG
      {
        pid('butAdminTstClear').style.display = 'inline-block';  // Pour le DEBUG
        pid('butAdminAddPoint').style.display = 'inline-block';  // Pour le DEBUG
      }
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
}


//--------------------------------------------------------------------------------------------------
// Chargement des positions depuis la base de données
//--------------------------------------------------------------------------------------------------
async function ChargementPositions()
{
  var lRet = "";
  var htmlInt = "";
  var longueurPositions = 0;
  var longueurPrev = 0;

  console.log("Chargement positions..");

  // Compte le nombre de points avant de les charger
  const lCmd = "user=eq." + USER
             + "&type=eq.100"     // Type trace
             + "&order=id.asc"
             + "&limit=0";        // Ne charge rien
  var { status, count } = await SupabaseCount(lCmd);
  if (status == "OK")
  {
    longueurPositions = count;
    console.log("Nombre de points : " + longueurPositions);
    if (longueurPositions > 0)
    {
      gPositions = [];
      let offset = 0;

      // Limitation par GET
      const batchSize = 1000;
      while (1)
      {
        const lCmd = "user=eq." + USER
                   + "&type=eq.100"     // Type trace
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
            gPositions = gPositions.concat(data);
            longueurPrev = gPositions.length;

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
        console.log("Chargement positions OK " + gPositions.length + " points");
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
        console.log("Chargement itinéraire OK " + gItineraire.length + " points");
      lRet = status;
    }

    // Aucun point mais ce n'est pas une erreur
    else
      lRet = "OK";
  }
  else
    lRet = status;

  pid('panChargement').style.display = 'none';
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
  if (gPositions.length > 0)
  {
    pid('imgCurseur').style.opacity = '1';
    pid('imgCurseur').style.left = p + '%';
  }
  else
  {
    pid('imgCurseur').style.opacity = '0';
    pid('imgCurseur').style.left = p + '%';
  }

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

  //----- S'il y a des positions -----
  if (gPositions.length > 0)
  {
    // On récupère la dernière position
    const pos = gPositions[gPositions.length - 1];
    const lDate = (pos.date).toString();

    // Date et heure
    const lDateAffichee = FormaterDateRelative(lDate);
    pid('txtHeurePosition').innerHTML = "<b>" + lDateAffichee.j + "</b><br>" + lDateAffichee.h;

    // Image du curseur
    if (pos.poi == 1) // Début
      pid('imgCurseur').src = IconeDebut.options.iconUrl;
    if (pos.poi == 2) // Position
      pid('imgCurseur').src = IconePosition.options.iconUrl;
    if (pos.poi == 3) // Bivouac
      pid('imgCurseur').src = IconeBivouac.options.iconUrl;
    if (pos.poi == 4) // Fin
      pid('imgCurseur').src = IconeFin.options.iconUrl;

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

    // lPourcentage à 100% si on est à la fin
    if (pos.poi == 4) // Fin
      pid('txtPourcentage').innerHTML = "100<small>%</small>";

    // Pas la fin, on affiche le % normal
    else
      pid('txtPourcentage').innerHTML = p + "<small>%</small>";

    pid('txtPourcentage').style.opacity = '1';

    pid('divDistances').innerHTML  = "Parcouru : <span class='classTexteLarge'><b>" + lParcourue + "</b></span> km";
    pid('divDistances').innerHTML += " -  Restant : <span class='classTexteLarge'><b>" + lRestant + "</b></span> km";
  }

  //----- S'il n'y a pas de position -----
  else
  {
    pid('divDistances').innerHTML  = "(Aucune position)";
    pid('txtPourcentage').style.opacity = '0';
    pid('txtHeurePosition').style.opacity = '0';
  }
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

  let dernierePosition = 0;
  if (gPositions.length > 0)
    dernierePosition = gPositions[gPositions.length - 1].numeroPointItineraire;;

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

  // Cas particulier du dernier point
  if (dernierePosition == (gItineraire.length - 1) )
      gDistanceParcourue = gDistanceTotaleItineraire;
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
// Rafraichir tout
// 'partial' : tout sauf l'itinéraire
// 'all'     : tout y compris l'itinéraire
//--------------------------------------------------------------------------------------------------
async function Rafraichir(pMode)
{
  // Uniquement si pas en cours
  if (gRafraichirEnCours == false)
  {
    gRafraichirEnCours = true;
    BoutonEtat('butRafraichir', 'actif');

    // Mémorise vue actuelle avant de rafraichir
    gCurrentZoom = map.getZoom();
    gCurrentCenter = map.getCenter();

    //---------- Remet tout à 0 ----------
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

    // Effacement
    if (pMode == 'all')
    {
      // Efface l'itinéraire et les marqueurs mais pas la carte
      map.eachLayer(function (layer)
      {
        // On ne supprime pas la couche de tuiles (TileLayer)
        if (layer instanceof L.Polyline || layer instanceof L.Marker || layer instanceof L.CircleMarker)
        {
          map.removeLayer(layer);
        }
      });
    }
    else // 'partial'
    {
      // N'efface que les marqueurs
      map.eachLayer(function (layer)
      {
        // On ne supprime pas la couche de tuiles (TileLayer)
        if (layer instanceof L.Marker || layer instanceof L.CircleMarker)
        {
          map.removeLayer(layer);
        }
      });
    }

    // Attente pour que tout soit effacé
    await sleep(300);
    pid('progression-fill').style.transition = backupTransitionBarre;
    pid('imgCurseur').style.transition = backupTransitionImage;

    //---------- Relire tout ----------
    await LecturePrenom();
    pid('txtPrenom').innerHTML = "<b>" + gPrenom + "</b>";
    CreationMarqueurs();

    // Rechargement de l'itinéraire
    if (pMode == 'all')
    {
      await LectureNomItinéraire();
      const lRetChargementItineraire = await ChargementItineraire();
    }

    // Rechargement des positions
    const lRetChargementPositions  = await ChargementPositions();
    InactivationBoutons();

    if (gItineraire.length > 0) AfficheRattachements();
    if (gItineraire.length > 0) AfficheItineraire();

    AffichePositions();
    if (gItineraire.length > 0) CalculeDistanceTotaleEtParcourue();
    if (gItineraire.length > 0) AfficheProgression();
  }

  // Fin du rafraichissement
  gRafraichirEnCours = false;

  // Bouton désactivé
  BoutonEtat('butRafraichir', 'inactif');
}

//--------------------------------------------------------------------------------------------------
// Met tous les boutons inactifs
//--------------------------------------------------------------------------------------------------
function InactivationBoutons()
{
  BoutonEtat('butRafraichir', 'inactif');
  BoutonEtat('butPartager', 'inactif');
  BoutonEtat('butAdmin', 'inactif');
}

//--------------------------------------------------------------------------------------------------
// Lecture du nom de l'itinéraire
//--------------------------------------------------------------------------------------------------
async function LectureNomItinéraire()
{
  lStatus = await SupabaseReadNomItineraire();
  if (lStatus.status == "OK" && lStatus.length > 0)
    gNomItineraire = lStatus.data[0].msg;
  else
    gNomItineraire = NOM_ITINEAIRE_DEFAUT;
}

//--------------------------------------------------------------------------------------------------
// Lit le Prénom
//--------------------------------------------------------------------------------------------------
async function LecturePrenom()
{
  const lecture = await SupabaseReadPrenom();
  if (lecture.status == "OK" && lecture.length > 0)
    gPrenom = lecture.data[0].msg;
  else
    gPrenom = PRENOM_DEFAUT;
}

//--------------------------------------------------------------------------------------------------
// Création des marqueurs à partir du Prénom
// Tous avec la lettre ${initiale}
//--------------------------------------------------------------------------------------------------
function CreationMarqueurs()
{
  const lettre = gPrenom[0];

  // Icones dynamiques
  IconeDebut =         createDynamicIcon(lettre, '#000', '#0F0');
  IconeFin =           createDynamicIcon(lettre, '#FFF', '#F00');
  IconePosition =      createDynamicIcon(lettre, '#FFF', '#008');
  IconeBivouac =       createDynamicIcon(lettre, '#FFF', '#83A');

  // Icones statiques
  createStaticIcons();

  // Attribution des images
  pid('imgCurseur').src = IconePosition.options.iconUrl;
  pid('imgCurseur').style.width = '26px';
  pid('imgCurseur').style.height = '26px';

  pid('imgLegendeDebut').src = IconeDebut.options.iconUrl;
  pid('imgLegendeDebut').style.width = '20px';
  pid('imgLegendeDebut').style.height = '20px';

  pid('imgLegendePosition').src = IconePosition.options.iconUrl;
  pid('imgLegendePosition').style.width = '20px';
  pid('imgLegendePosition').style.height = '20px';

  pid('imgLegendeBivouac').src = IconeBivouac.options.iconUrl;
  pid('imgLegendeBivouac').style.width = '20px';
  pid('imgLegendeBivouac').style.height = '20px';

  pid('imgLegendeFin').src = IconeFin.options.iconUrl;
  pid('imgLegendeFin').style.width = '20px';
  pid('imgLegendeFin').style.height = '20px';
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

  // Il était inactif, on l'active
  if (but.state != 'actif')
  {
    BoutonEtat('butAdmin', 'actif');

    //----- Remplissage des champs avant l'affichage -----
    // Nb Points
    pid('txtAdminNbPoints').innerHTML = S(gItineraire.length, "point");

    // Nom itinéraire
    pid('txtAdminNomItineraire').value = gNomItineraire;

    // Prénom
    pid('txtAdminPrenom').value = gPrenom;

    // Flag pour savoir si on doit rafraichir quand on désactive le menu Admin
    gDoitEtreRafraichi =false;

    // Positionnement du panel
    const rect = pid('panButtonsMenu').getBoundingClientRect();
    pid('panAdminCommandes').style.top = rect.bottom + 'px'; // Sous le menu
    pid('panAdminCommandes').style.display = 'block';
  }

  // Il était actif, on le désactive
  else
  {
    BoutonEtat('butAdmin', 'inactif');
    pid('panAdminCommandes').style.display = 'none';

    // On doit tout rafraichir
    if (gDoitEtreRafraichi)
    {
      gDoitEtreRafraichi = false;
      Rafraichir("all");
    }
  }
}

//--------------------------------------------------------------------------------------------------
// Charger un itinéraire
//--------------------------------------------------------------------------------------------------
async function ButAdminChargerClick()
{
  pid('butAdminCharger').style.backgroundColor = '#FC8';

  // Chargement du fichier et écriture dans la base de données
  const lSave = pid('txtAdminNbPoints').innerHTML;
  pid('txtAdminNbPoints').innerHTML = "Choisir le fichier ..";
  const lRet = await ButLoadClick();

  console.log("lRet = " + lRet);

  // Rechargement de l'itinéraire depuis la base de données si tout s'est bien passé
  if (lRet ==2)
  {
    gItineraire = [];
    lRetChargement = await ChargementItineraireAdmin();

    // Lecture du nom de l'itinéraire
    lStatus = await SupabaseReadNomItineraire();
    gNomItineraire = lStatus.data[0].msg;
    pid('txtAdminNomItineraire').value = gNomItineraire;

    // On doit rafraichir
    gDoitEtreRafraichi = true;
  }
  else
    pid('txtAdminNbPoints').innerHTML = lSave;
  pid('butAdminCharger').style.backgroundColor = '#DDD';
}


//--------------------------------------------------------------------------------------------------
// Modifier le nom de l'itinéraire
//--------------------------------------------------------------------------------------------------
async function ButAdminModifierNomClick()
{
  pid('butAdminModifierNom').style.backgroundColor = '#FC8';

  // Ecriture du nom de l'itinéraire dans la base de données
  nouveau = pid('txtAdminNomItineraire').value;
  lStatus = await SupabaseWriteNomItineraire(nouveau);

  // Relecture du nom de l'itinéraire
  lStatus = await SupabaseReadNomItineraire();
  if (lStatus.status == "OK" && lStatus.length > 0)
    gNomItineraire = lStatus.data[0].msg;
  else
    gNomItineraire = NOM_ITINEAIRE_DEFAUT;

  // Affichage
  await sleep(100);
  gDoitEtreRafraichi = true;
  pid('butAdminModifierNom').style.backgroundColor = '#DDD';
}


//--------------------------------------------------------------------------------------------------
// Modifier le Prénom de l'utilisateur
//--------------------------------------------------------------------------------------------------
async function ButAdminModifierPrenomClick()
{
  pid('butAdminModifierPrenom').style.backgroundColor = '#FC8';

  // Ecriture du Prénom de l'utilisateur dans la base de données
  const nouveau = pid('txtAdminPrenom').value;
  lStatus = await SupabaseWritePrenom(nouveau);

  // Relecture du prénom
  lStatus = await SupabaseReadPrenom();
  gPrenom = lStatus.data[0].msg;

  // Affichage
  await sleep(100);
  gDoitEtreRafraichi = true;
  pid('butAdminModifierPrenom').style.backgroundColor = '#DDD';
}

//--------------------------------------------------------------------------------------------------
// Effacer les informations
//--------------------------------------------------------------------------------------------------
async function ButAdminEffacerClick()
{
  pid('butAdminEffacer').style.backgroundColor = '#FC8';

  // Effacement de la base de données
  // Itinéraire
  // Positions
  // Prénom
  // Nom itinéraire
  SupabaseClearAllInformations();

  // Effacement variables locales
  gItineraire = [];
  gPositions = [];
  pid('txtAdminNbPoints').innerHTML = S(gItineraire.length, "point");
  pid('txtAdminNomItineraire').value = NOM_ITINEAIRE_DEFAUT;
  pid('txtAdminPrenom').value = PRENOM_DEFAUT;

  // Affichage
  await sleep(100);
  gDoitEtreRafraichi = true;
  pid('butAdminEffacer').style.backgroundColor = '#DDD';
}

//==================================================================================================

function ButAdminTstClear()
{
}

//--------------------------------------------------------------------------------------------------
// Ajout d'un point par raport au tracé
//--------------------------------------------------------------------------------------------------
async function ButAdminTstAddPoint()
{
  //----- Parcourt l'itinéraire pour ajouter une position -----
  const increment = Math.floor(gItineraire.length / 9);
  var nb = 0;
  for (let i = 0; i < (gItineraire.length - 0*increment); i++)
  {

    // Nouvelle position possible
    if (i%increment == 0)
    {
      nb++;


      // On ne met pas plus de positions
      if (nb == 11)
        break;

      // On mémorise cette position
      if (nb > gPositions.length)
      {
        console.log("add nb = " + nb);

        var lLigne = {...gItineraire[i]};
          console.log("Coordonnées mémorisées: ", lLigne.lat, lLigne.lon);

        // POINT 1
        if (nb == 1)
        {
          lLigne.lat += 0.000;
          lLigne.lon -= 0.005;
          const t0 = performance.now();
          const nouveauPoint =
          {
              date: DateSupabase(),    // Format personnalisé (2026/10/11 09:31:12)
              user: USER,
              type: 100,               // Trace
              lat:  lLigne.lat,
              lon:  lLigne.lon,
              alt:  1234,
              prec: 5,
              poi:  1,                // Début
              msg: "Départ de la randonnée"
          };

          // Ecriture
          const lStatus = await SupabaseWrite(nouveauPoint);
          const delta = Math.round(0.100*(performance.now() - t0))/100;
          console.log("Ecriture " + lStatus + " (" + delta + "s)");
        }

        // POINT 2..5
        if ((nb >= 2) && (nb <= 5))
        {
          lLigne.lat += 0.000;
          lLigne.lon -= 0.000;
          const t0 = performance.now();
          const nouveauPoint =
          {
              date: DateSupabase(),    // Format personnalisé (2026/10/11 09:31:12)
              user: USER,
              type: 100,               // Trace
              lat:  lLigne.lat,
              lon:  lLigne.lon,
              alt:  1234,
              prec: 5,
              poi:  2,                // Point normal
              msg: "Tout va bien au point n°" + nb
          };

          // Ecriture
          const lStatus = await SupabaseWrite(nouveauPoint);
          const delta = Math.round(0.100*(performance.now() - t0))/100;
          console.log("Ecriture " + lStatus + " (" + delta + "s)");
        }

        // POINT 6
        if (nb == 6)
        {
          lLigne.lat += 0.005;
          lLigne.lon -= 0.000;
          const t0 = performance.now();
          const nouveauPoint =
          {
              date: DateSupabase(),    // Format personnalisé (2026/10/11 09:31:12)
              user: USER,
              type: 100,               // Trace
              lat:  lLigne.lat,
              lon:  lLigne.lon,
              alt:  1250,
              prec: 6,
              poi:  3,                // Bivouac
              msg: "C'est l'heure de faire dodo.\nEt ça va faire du bien\n" + nb
          };

          // Ecriture
          const lStatus = await SupabaseWrite(nouveauPoint);
          const delta = Math.round(0.100*(performance.now() - t0))/100;
          console.log("Ecriture " + lStatus + " (" + delta + "s)");
        }

        // POINT 7..9
        if ((nb >= 7) && (nb <= 9))
        {
          lLigne.lat += 0.000;
          lLigne.lon -= 0.000;
          const t0 = performance.now();
          const nouveauPoint =
          {
              date: DateSupabase(),    // Format personnalisé (2026/10/11 09:31:12)
              user: USER,
              type: 100,               // Trace
              lat:  lLigne.lat,
              lon:  lLigne.lon,
              alt:  1250,
              prec: 6,
              poi:  2,                // Point normal
              msg: "Ça continue\n" + nb
          };

          // Ecriture
          const lStatus = await SupabaseWrite(nouveauPoint);
          const delta = Math.round(0.100*(performance.now() - t0))/100;
          console.log("Ecriture " + lStatus + " (" + delta + "s)");
        }

        // POINT 10
        if (nb === 10)
        {
          lLigne.lat += 0.005;
          lLigne.lon -= 0.000;
          const t0 = performance.now();
          const nouveauPoint =
          {
              date: DateSupabase(),    // Format personnalisé (2026/10/11 09:31:12)
              user: USER,
              type: 100,               // Trace
              lat:  lLigne.lat,
              lon:  lLigne.lon,
              alt:  1250,
              prec: 6,
              poi:  4,                // Point final
              msg: "C'est fini, youpi \n"
          };

          // Ecriture
          const lStatus = await SupabaseWrite(nouveauPoint);
          const delta = Math.round(0.100*(performance.now() - t0))/100;
          console.log("Ecriture " + lStatus + " (" + delta + "s)");
        }

        // 1 point à la fois
        break;
      }
    }
  }
}

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