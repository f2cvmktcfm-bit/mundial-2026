exports.handler = async function () {
  const token = process.env.SPORTMONKS_TOKEN;

  if (!token) {
    return responder(500, {
      error: "Falta configurar SPORTMONKS_TOKEN en Netlify"
    });
  }

  const startDate = process.env.START_DATE || "2026-06-11";
  const endDate = process.env.END_DATE || "2026-07-19";
  const leagueId = process.env.SPORTMONKS_LEAGUE_ID;

  const url = new URL(
    `https://api.sportmonks.com/v3/football/fixtures/between/${startDate}/${endDate}`
  );

  url.searchParams.set("api_token", token);
  url.searchParams.set(
    "include",
    "participants;scores;venue;league;stage;round;group;state"
  );

  try {
    const respuesta = await fetch(url);

    if (!respuesta.ok) {
      const detalle = await respuesta.text();
      return responder(respuesta.status, {
        error: "SportMonks respondió con error",
        detalle
      });
    }

    const datos = await respuesta.json();
    let fixtures = Array.isArray(datos.data) ? datos.data : [];

    if (leagueId) {
      fixtures = fixtures.filter(
        fixture => String(fixture.league_id) === String(leagueId)
      );
    }

    const matches = fixtures.map(adaptarSportmonks);

    return responder(200, { matches });
  } catch (error) {
    return responder(500, {
      error: "No se pudieron cargar los partidos",
      detalle: error.message
    });
  }
};

function responder(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    },
    body: JSON.stringify(body)
  };
}

function adaptarSportmonks(fixture) {
  const local = obtenerEquipo(fixture, "home");
  const visitante = obtenerEquipo(fixture, "away");
  const marcador = obtenerMarcadorActual(fixture);
  const fechaHora = fixture.starting_at || "";
  const [fecha, horaCompleta] = fechaHora.split(" ");
  const hora = horaCompleta ? `${horaCompleta.slice(0, 5)} UTC` : "Horario a confirmar";

  return {
    id: String(fixture.id),
    date: fecha || "Sin fecha",
    time: hora,
    group:
      fixture.group?.name ||
      fixture.stage?.name ||
      fixture.round?.name ||
      fixture.league?.name ||
      "Fase a confirmar",
    round:
      fixture.round?.name ||
      fixture.stage?.name ||
      "Fase a confirmar",
    team1: local,
    team2: visitante,
    ground: fixture.venue?.name || "Sede a confirmar",
    marcador,
    estado: obtenerEstado(fixture, marcador)
  };
}

function obtenerEquipo(fixture, location) {
  const equipo = fixture.participants?.find(
    participante => participante.meta?.location === location
  );

  return equipo?.name || "Equipo por definir";
}

function obtenerMarcadorActual(fixture) {
  const scores = fixture.scores || [];
  const current = scores.filter(score => score.description === "CURRENT");

  const golesLocal = current.find(
    score => score.score?.participant === "home"
  )?.score?.goals;

  const golesVisitante = current.find(
    score => score.score?.participant === "away"
  )?.score?.goals;

  if (golesLocal === undefined || golesVisitante === undefined) {
    return null;
  }

  return `${golesLocal} : ${golesVisitante}`;
}

function obtenerEstado(fixture, marcador) {
  const estado =
    fixture.state?.short_name ||
    fixture.state?.name ||
    fixture.result_info ||
    "";

  const texto = String(estado).toLowerCase();

  if (texto.includes("live") || texto.includes("inplay")) {
    return "En vivo";
  }

  if (
    texto.includes("ft") ||
    texto.includes("finished") ||
    texto.includes("full-time") ||
    texto.includes("ended")
  ) {
    return "Finalizado";
  }

  if (marcador) {
    return "En juego / actualizado";
  }

  return "Por jugar";
}
