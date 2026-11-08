
"use strict";

// Germany Over 1.5 Lab 1.0
// Generator TRIPLE / FOURFOLD
// Kursy Over 1.5 wpisywane recznie.

const OVER15_CONFIG = {
  minTotalOdds: 2.00,
  minIndividualEV: 0,
  minCouponEV: 0,
  recent: 40,
  minHistory: 100,
  minVenueGames: 5,
  maxCandidates: 30,
  maxResults: 10
};

const OVER15_MODELS = {
  D1: { poissonWeight: 0.50 },
  D2: { poissonWeight: 0.00 }
};

let over15Database = [];

async function loadOver15GeneratorData() {
  const response = await fetch(
    "./data/all_matches.json?ts=" + Date.now()
  );

  if (!response.ok) {
    throw new Error("Nie mozna pobrac bazy meczow");
  }

  const data = await response.json();

  if (!Array.isArray(data)) {
    throw new Error("Niepoprawny format bazy");
  }

  over15Database = data.filter(m =>
    (m.league === "D1" || m.league === "D2") &&
    typeof m.date === "string" &&
    typeof m.home === "string" &&
    typeof m.away === "string" &&
    Number.isInteger(m.home_goals) &&
    Number.isInteger(m.away_goals) &&
    m.home_goals >= 0 &&
    m.away_goals >= 0
  );

  return over15Database.length;
}

function over15Average(matches, field) {
  if (!matches.length) return 0;

  return matches.reduce(
    (sum, m) => sum + m[field], 0
  ) / matches.length;
}

function over15Probability(history, home, away, league) {
  const config = OVER15_CONFIG;

  if (!OVER15_MODELS[league]) {
    return null;
  }

  if (history.length < config.minHistory) {
    return null;
  }

  const homeGames = history
    .filter(m => m.home === home)
    .slice(-config.recent);

  const awayGames = history
    .filter(m => m.away === away)
    .slice(-config.recent);

  if (
    homeGames.length < config.minVenueGames ||
    awayGames.length < config.minVenueGames
  ) {
    return null;
  }

  const leagueRate = history.filter(m =>
    m.home_goals + m.away_goals >= 2
  ).length / history.length;

  const homeRate = homeGames.filter(m =>
    m.home_goals + m.away_goals >= 2
  ).length / homeGames.length;

  const awayRate = awayGames.filter(m =>
    m.home_goals + m.away_goals >= 2
  ).length / awayGames.length;

  const historicalP =
    0.50 * leagueRate +
    0.25 * homeRate +
    0.25 * awayRate;

  const poissonWeight =
    OVER15_MODELS[league].poissonWeight;

  // D2 uzywa wyłącznie modelu historycznego.
  if (poissonWeight === 0) {
    return historicalP;
  }

  const leagueHomeGoals =
    over15Average(history, "home_goals");

  const leagueAwayGoals =
    over15Average(history, "away_goals");

  const homeAttack =
    over15Average(homeGames, "home_goals") /
    Math.max(0.2, leagueHomeGoals);

  const awayDefense =
    over15Average(awayGames, "home_goals") /
    Math.max(0.2, leagueHomeGoals);

  const awayAttack =
    over15Average(awayGames, "away_goals") /
    Math.max(0.2, leagueAwayGoals);

  const homeDefense =
    over15Average(homeGames, "away_goals") /
    Math.max(0.2, leagueAwayGoals);

  const expectedHome = Math.max(
    0.2,
    Math.min(
      4,
      leagueHomeGoals * homeAttack * awayDefense
    )
  );

  const expectedAway = Math.max(
    0.2,
    Math.min(
      4,
      leagueAwayGoals * awayAttack * homeDefense
    )
  );

  const lambda = expectedHome + expectedAway;

  const poissonP =
    1 - Math.exp(-lambda) * (1 + lambda);

  return (
    (1 - poissonWeight) * historicalP +
    poissonWeight * poissonP
  );
}

function analyzeOver15Match(match) {
  const league = match.league;
  const home = String(match.home || "").trim();
  const away = String(match.away || "").trim();
  const odds = Number(match.odds);
  const date = String(match.date || "").trim();

  if (!OVER15_MODELS[league]) {
    return { error: "Niepoprawna liga" };
  }

  if (!home || !away || home === away) {
    return { error: "Niepoprawne druzyny" };
  }

  if (!Number.isFinite(odds) || odds <= 1) {
    return { error: "Niepoprawny kurs" };
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(Date.parse(date))) {
    return { error: "Niepoprawna data meczu" };
  }

  // Uwzgledniamy tylko zakonczone mecze
  // z dat wczesniejszych od analizowanego spotkania.
  const history = over15Database
    .filter(m =>
      m.league === league &&
      m.date < date
    )
    .sort((a, b) => a.date.localeCompare(b.date));

  const p = over15Probability(
    history, home, away, league
  );

  if (p === null) {
    return {
      league, home, away, odds, date,
      error: "BRAK PROGNOZY - za malo danych"
    };
  }

  const probability = Math.max(
    0.01, Math.min(0.99, p)
  );

  const ev = probability * odds - 1;

  return {
    league,
    home,
    away,
    date,
    odds,
    probability,
    ev,
    fairOdds: 1 / probability,
    model: league === "D1"
      ? "50% Poisson + 50% historia"
      : "100% historia"
  };
}

function generateOver15Coupons(matches, size) {
  if (size !== 3 && size !== 4) {
    throw new Error("Wybierz 3 lub 4 mecze");
  }

  if (!Array.isArray(matches)) {
    throw new Error("Niepoprawna lista meczow");
  }

  if (matches.length > OVER15_CONFIG.maxCandidates) {
    throw new Error("Maksymalnie 30 meczow");
  }

  const analyzed = matches.map(analyzeOver15Match);

  const eligible = analyzed.filter(m =>
    !m.error &&
    m.ev > OVER15_CONFIG.minIndividualEV
  );

  const coupons = [];

  function search(start, selected) {
    if (selected.length === size) {
      const totalOdds = selected.reduce(
        (value, m) => value * m.odds, 1
      );

      if (totalOdds < OVER15_CONFIG.minTotalOdds) {
        return;
      }

      const probability = selected.reduce(
        (value, m) => value * m.probability, 1
      );

      const ev = probability * totalOdds - 1;

      if (ev <= OVER15_CONFIG.minCouponEV) {
        return;
      }

      coupons.push({
        matches: [...selected],
        totalOdds,
        probability,
        ev
      });

      return;
    }

    for (let i = start; i < eligible.length; i++) {
      const candidate = eligible[i];

      // Jeden zespol nie moze grac w dwoch
      // spotkaniach tego samego dnia.
      const conflict = selected.some(m =>
        m.date === candidate.date &&
        m.league === candidate.league &&
        (
          m.home === candidate.home ||
          m.home === candidate.away ||
          m.away === candidate.home ||
          m.away === candidate.away
        )
      );

      if (conflict) continue;

      selected.push(candidate);
      search(i + 1, selected);
      selected.pop();
    }
  }

  search(0, []);

  coupons.sort((a, b) =>
    b.ev - a.ev ||
    b.probability - a.probability
  );

  return {
    analyzed,
    eligibleCount: eligible.length,
    coupons: coupons.slice(
      0, OVER15_CONFIG.maxResults
    ),
    totalFound: coupons.length
  };
}

window.GermanyOver15 = {
  loadData: loadOver15GeneratorData,
  analyzeMatch: analyzeOver15Match,
  generateCoupons: generateOver15Coupons
};
