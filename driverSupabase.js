//==================================================================================================
// Gestion des requêtes pour Supabase
// Tag 2610.18
//==================================================================================================

// URL de votre application web Google Apps Script
var API_URL = "?";
var API_KEY = "?";
var USER    = "?";

//--------------------------------------------------------------------------------------------------
// Date au format Supabase compacté par tolliv
// 261011093112 pour 2026 octobre 11 : 09h31m12s
//--------------------------------------------------------------------------------------------------
function DateSupabase()
{
  const now = new Date();

  // Récupération des composants de la date
  const yy = String(now.getFullYear()).slice(-2); // Les 2 derniers chiffres de l'année
  const mm = String(now.getMonth() + 1).padStart(2, '0'); // Mois (0-11 donc +1)
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mi = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');

  // Concaténation au format nombre 261011093112
  const result = yy + mm + dd + hh + mi + ss;
  return(Number(result, 10));
}

//--------------------------------------------------------------------------------------------------
// Vérification de la connexion à la base de données
// Lecture du dernier point
//--------------------------------------------------------------------------------------------------
async function ButTestClick()
{
  console.log("Test en cours");
  const t0 = performance.now();
  const lCmd= "user=eq." + USER
            + "&order=date.desc"
            + "&limit=1";
  const {status, length, data} = await SupabaseRead(lCmd);
  const delta = Math.round(0.100*(performance.now() - t0))/100;
  if (status == "OK" & length == 0)
    console.log("vide (" + delta + "s)");
  else if (status == "OK")
    console.log("OK " + length + " points (" + delta + "s) " + data[length-1].date);
  else
    console.log(status + " (" + delta + "s)");
}

//--------------------------------------------------------------------------------------------------
// Envoi d'un point
//--------------------------------------------------------------------------------------------------
async function ButEnvoiClick()
{
  console.log("Ecriture en cours");
  const t0 = performance.now();
  const nouveauPoint =
  {
      date: DateSupabase(),    // Format personnalisé (2026/10/11 09:31:12)
      user: USER,
      type: 1,                 // Trace
      lat:  45.278,
      lon:  1.432,
      alt:  1234,
      prec: 5,
      poi:  1,
      msg: "Départ de la randonnée"
  };

  // Ecriture
  const lStatus = await SupabaseWrite(nouveauPoint);
  const delta = Math.round(0.100*(performance.now() - t0))/100;
  console.log("Ecriture " + lStatus + " (" + delta + "s)");
}

//--------------------------------------------------------------------------------------------------
// Lecture d'un nombre de points en partant de la fin
//--------------------------------------------------------------------------------------------------
async function ButLectureClick(pNb)
{
  console.log("Lecture en cours");
  const t0 = performance.now();
  const lCmd= "user=eq." + USER
            + "&order=date.desc"
            + "&limit=" + pNb;
  const {status, length, data} = await SupabaseRead(lCmd);
  const delta = Math.round(0.100*(performance.now() - t0))/100;
  if (status == "OK" & length == 0)
    console.log("vide (" + delta + "s)");
  else if (status == "OK")
  {
    console.log("OK " + length + " points (" + delta + "s) " + data[length-1].date);
    data.reverse();   // Remet l'ordre [0]=le plus ancien
  }
  else
    console.log(status + " (" + delta + "s)");
}

//--------------------------------------------------------------------------------------------------
// Effacement des points de l'utilisateur actuel
//--------------------------------------------------------------------------------------------------
async function ButClearClick()
{
  const t0 = performance.now();
  const lCmd = "user=eq." + USER;
  const lStatus = await SupabaseDelete(lCmd);
  const delta = Math.round(0.100 * (performance.now() - t0)) / 100;
  console.log("Suppression " + lStatus + " (" + delta + "s)");
}


//==================================================================================================

//--------------------------------------------------------------------------------------------------
// Vérification de la connexion à la base de données
// Lecture d'une ligne
// Ecriture d'une valeur 300
//--------------------------------------------------------------------------------------------------
async function SupabaseTestConnexion()
{
  var lRet;
  var lCmd;
  var retStatus;
  do
  {
    // Connexion
    lCmd = "limit=1";
    lRet = await SupabaseRead(lCmd);
    if (lRet.status != "OK")
    {
      retStatus = lRet.status;
      break;
    }

    // Ecriture 301 (ne sert qu'au test écriture/lecture)
    const lDate = DateSupabase();
    const nouveauPoint =
    {
        date: lDate,
        user: USER,
        type: 301,
        msg: "test Write/Read"
    };
    lRet = await SupabaseWrite(nouveauPoint);
    if (lRet != "OK")
    {
      retStatus = "Erreur pendant le test d'écriture";
      break;
    }

    // Relecture 301 (ne sert qu'au test écriture/lecture)
    lCmd = "user=eq." + USER
         + "&type=eq.301"
         + "&order=date.desc"
         + "&limit=100";
    lRet = await SupabaseRead(lCmd);
    if ( (lRet.status != "OK") || (lRet.length == 0) )
    {
      retStatus = "Erreur pendant le test de lecture";
      break;
    }

    // Suppression si 301 existant
    if (lRet.length > 0)
    {
      const lCmd = "user=eq." + USER
                 + "&type=eq.301";
      let lStatus = await SupabaseDelete(lCmd);
      if (lStatus != "OK")
      {
        retStatus = "Erreur pendant le test de suppression";
        break;
      }
    }

    // Relecture 301 (on ne doit plus en avoir)
    lCmd = "user=eq." + USER
         + "&type=eq.301"
         + "&order=date.desc"
         + "&limit=100";
    lRet = await SupabaseRead(lCmd);
    if ( (lRet.status != "OK") || (lRet.length != 0) )
    {
      retStatus = "Erreur pendant le test de relecture";
      break;
    }

    // Tout est bon
    retStatus = "OK";
  } while(0);
  return (retStatus);
}

//--------------------------------------------------------------------------------------------------
// Envoie un nouveau point dans la base de données
//--------------------------------------------------------------------------------------------------
async function SupabaseWrite(data)
{
  try
  {
    const response = await fetch(API_URL,
    {
      method: 'POST',
      headers: {
        'apikey': API_KEY,
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal' // Ne renvoie pas la ligne insérée
      },
      body: JSON.stringify(data)
    });

    if (!response.ok)
    {
      const error = await response.json();
      return("Erreur SupabaseSendPoint : " + error.message);
    }
   return("OK");
  }
  catch (error)
  {
    return("Erreur SupabaseSendPoint : " + error);
  }
}

//--------------------------------------------------------------------------------------------------
// Lit un nombre de points dans la base de données
// En partant de la fin
//--------------------------------------------------------------------------------------------------
async function SupabaseRead(pCmd)
{
  try
  {
    const url = API_URL + "?" + pCmd;
    const response = await fetch(url,
    {
      method: 'GET',
      headers:
      {
        'apikey': API_KEY,
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok)
    {
      const error = await response.json();
      return {status:"Erreur SupabaseRead : " + error.message, length:0, data:null};
    }

    const lData = await response.json();
    if (lData && lData.length == 0)
      return {status:"OK", length:0, data:null};

    if (lData && lData.length > 0)
    {
      return {status:"OK", length:lData.length , data:lData};
    }
  }
  catch (error)
  {
      return {status:"Erreur SupabaseRead", length:0, data:null};
  }
}

//--------------------------------------------------------------------------------------------------
// Supprime des éléments dans la base de données selon une condition
//--------------------------------------------------------------------------------------------------
async function SupabaseDelete(pCmd)
{
  try
  {
    const url = API_URL + "?" + pCmd;
    const response = await fetch(url,
    {
      method: 'DELETE', // Méthode HTTP pour supprimer
      headers: {
        'apikey': API_KEY,
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok)
    {
      const error = await response.json();
      return("Erreur SupabaseDelete : " + error.message);
    }
    return("OK");
  }
  catch (error)
  {
    return("Erreur SupabaseDelete : " + error);
  }
}

//--------------------------------------------------------------------------------------------------
// Compte le nombre de points correspondant à un critère
//--------------------------------------------------------------------------------------------------
async function SupabaseCount(pCmd)
{
  try
  {
    const url = API_URL + "?" + pCmd;
    const response = await fetch(url,
    {
      method: 'GET',
      headers: {
        'apikey': API_KEY,
        'Authorization': `Bearer ${API_KEY}`,
        'Prefer': 'count=exact' // Demande à Supabase de calculer le total
      }
    });

    if (!response.ok) {
      const error = await response.json();
      return { status: "Erreur SupabaseCount : " + error.message, count: -1 };
    }

    // Le résultat se trouve dans le header 'content-range'
    // Format reçu : "0-0/125" (où 125 est le total)
    const contentRange = response.headers.get('content-range');
    let total = 0;

    if (contentRange)
    {
      const parts = contentRange.split('/');
      if (parts.length > 1)
      {
        total = parseInt(parts[1], 10);
      }
    }
    return { status: "OK", count: total };
  }
  catch (error)
  {
    return { status: "Erreur SupabaseCount : " + error, count: -1 };
  }
}