import { Dex, ID, PokemonSet, Species, toID } from 'ps';
import * as aliases from './aliases.json';

const ALIASES: Readonly<{ [id: string]: string }> = aliases;

export function fromAlias(name: string) {
  return ALIASES[toID(name)] || name;
}

export function getSpecies(name: string, dex: Dex) {
  const species = dexForFormat(dex).getSpecies(name);
  if (!species) throw new Error(`Unknown species '${name}'`);
  return species;
}

export function getBaseSpecies(name: string, dex: Dex): Species {
  const species = getSpecies(name, dex);
  return species.baseSpecies && species.baseSpecies !== species.name
    ? getBaseSpecies(species.baseSpecies, dex)
    : species;
}

// TODO: Remove this function in favor of using the actual dex calls once format is fixed.
export function dexForFormat(dex?: Dex) {
  return (/* dex || FIXME */ Dex.get());
}

const MEGA_RAYQUAZA_BANNED = new Set([
  'ubers',
  'battlefactory',
  'megamons',
  'gen6ubers',
  'gen7ubers',
  'gen7pokebankubers',
]);

export function isMegaRayquazaAllowed(dex?: Dex) {
  return !MEGA_RAYQUAZA_BANNED.has((dex || Dex.get()).format);
}

export function isMega(species: Species) {
  // FIXME: Ultra Burst?
  return species.forme && (species.forme.startsWith('Mega') || species.forme.startsWith('Primal'));
}

export function getMegaEvolution(pokemon: PokemonSet<string | ID>, dex: Dex) {
  const item = dexForFormat(dex).getItem(pokemon.item);
  if (!item) return undefined;
  const species = getSpecies(pokemon.species, dex);
  if (
    item.name === 'Blue Orb' &&
    (species.species === 'Kyogre' || species.baseSpecies === 'Kyogre')
  ) {
    return { species: 'kyogreprimal' as ID, ability: 'primordialsea' as ID };
  }
  if (
    item.name === 'Red Orb' &&
    (species.species === 'Groudon' || species.baseSpecies === 'Groudon')
  ) {
    return { species: 'groudonprimal' as ID, ability: 'desolateland' as ID };
  }
  // FIXME: Ultra Burst?
  if (!item.megaEvolves || item.megaEvolves !== species.species || !item.megaStone) {
    return undefined;
  }
  const mega = getSpecies(item.megaStone, dex);
  if (!mega) return undefined;
  return { species: toID(mega.species), ability: toID(mega.abilities['0']) };
}

export function revertFormes(id: ID, dex: Dex) {
  const species = getSpecies(id, dex);
  if (!species.forme || isMega(species)) return id;
  return getBaseSpecies(species.id, dex).id;
}

// FIXME: Generate this based on gameType from config/formats.js
const NON_SINGLES_FORMATS = new Set([
  'battlespotdoubles',
  'battlespotspecial7',
  'battlespottriples',
  'doublesou',
  'doublesubers',
  'doublesuu',
  'gen5doublesou',
  'gen5smogondoubles',
  'gen7battlespotdoubles',
  'gen7doublesanythinggoes',
  'gen7doublesanythinggoesbeta',
  'gen7doublesou',
  'gen7doublesoubeta',
  'gen7pokebankdoubleaanythinggoes',
  'gen7pokebankdoublesag',
  'gen7pokebankdoublesanythinggoes',
  'gen7pokebankdoublesou',
  'gen7pokebankdoublesoubeta',
  'gen7randomdoublesbattle',
  'gen7vgc2017',
  'gen7vgc2017beta',
  'orassmogondoubles',
  'randomdoublesbattle',
  'randomtriplesbattle',
  'smogondoubles',
  'smogondoublessuspecttest',
  'smogondoublesubers',
  'smogondoublesuu',
  'smogontriples',
  'smogontriples',
  'vgc2014',
  'vgc2015',
  'vgc2016',
  'vgc2017',
]);

export function isNonSinglesFormat(dex: Dex) {
  const f = dex.format;
  return NON_SINGLES_FORMATS.has(f.endsWith('suspecttest') ? f.slice(0, -11) : f);
}

// FIXME: Generate this based on teamLength from config/formats.js
const NON_6V6_FORMATS = new Set([
  '1v1',
  'battlespotdoubles',
  'battlespotsingles',
  'battlespotspecial7',
  'challengecup1v1',
  'gen5gbusingles',
  'gen71v1',
  'gen7alolafriendly',
  'gen7battlespotdoubles',
  'gen7battlespotsingles',
  'gen7challengecup1v1',
  'gen7vgc2017',
  'gen7vgc2017beta',
  'pgllittlecup',
  'vgc2014',
  'vgc2015',
  'vgc2016',
  'vgc2017',
]);

export function isNon6v6Format(dex: Dex) {
  const f = dex.format;
  return NON_6V6_FORMATS.has(f.endsWith('suspecttest') ? f.slice(0, -11) : f);
}

export function canonicalizeFormat(format: ID) {
  if (format.endsWith('current')) format = format.slice(0, -7) as ID;
  if (format.startsWith('pokebank')) format = format.slice(8, -4) as ID;
  if (format.startsWith('oras')) format = format.slice(4) as ID;
  if (format === 'capbeta') return 'cap' as ID;
  if (format === 'vgc2014beta') return 'vgc2014' as ID;
  if (format.startsWith('xybattlespot') && format.endsWith('beta')) {
    format = format.slice(0, -4) as ID;
  }
  if (['battlespotdoubles', 'battlespotdoublesvgc2015'].includes(format)) {
    return 'vgc2015' as ID;
  }
  if (format === 'smogondoubles') return 'doublesou' as ID;
  if (format === 'smogondoublesubers') return 'doublesubers' as ID;
  if (format === 'smogondoublesuu') return 'doublesuu' as ID;
  return format as ID;
}

export function victoryChance(r1: number, d1: number, r2: number, d2: number) {
  const C = (3.0 * Math.pow(Math.log(10.0), 2.0)) / Math.pow(400.0 * Math.PI, 2);
  const d = Math.pow(d1, 2.0) + Math.pow(d2, 2.0);
  return 1.0 / (1.0 + Math.pow(10.0, (r2 - r1) / 400.0 / Math.sqrt(1.0 + C * d)));
}

export function weighting(rating: number, deviation: number, cutoff: number) {
  if (deviation > 100 && cutoff > 1500) return 0;
  return (erf((rating - cutoff) / deviation / Math.sqrt(2.0)) + 1.0) / 2.0;
}

const MAX_NUM = Math.pow(2, 53);
const THRESH = 0.46875;
const SQRPI = 5.6418958354775628695e-1;
const P = [
  [
    3.1611237438705656,
    1.13864154151050156e2,
    3.77485237685302021e2,
    3.20937758913846947e3,
    1.85777706184603153e-1,
  ],
  [
    5.64188496988670089e-1,
    8.88314979438837594,
    6.61191906371416295e1,
    2.98635138197400131e2,
    8.8195222124176909e2,
    1.71204761263407058e3,
    2.05107837782607147e3,
    1.23033935479799725e3,
    2.15311535474403846e-8,
  ],
  [
    3.05326634961232344e-1,
    3.60344899949804439e-1,
    1.25781726111229246e-1,
    1.60837851487422766e-2,
    6.58749161529837803e-4,
    1.63153871373020978e-2,
  ],
];
const Q = [
  [2.36012909523441209e1, 2.44024637934444173e2, 1.28261652607737228e3, 2.84423683343917062e3],
  [
    1.57449261107098347e1,
    1.17693950891312499e2,
    5.37181101862009858e2,
    1.62138957456669019e3,
    3.29079923573345963e3,
    4.36261909014324716e3,
    3.43936767414372164e3,
    1.23033935480374942e3,
  ],
  [
    2.56852019228982242,
    1.87295284992346047,
    5.27905102951428412e-1,
    6.05183413124413191e-2,
    2.33520497626869185e-3,
  ],
];

// Compute the erf function of a value using a rational Chebyshev
// approximations for different intervals of x.
//
// This is a translation of W. J. Cody's Fortran implementation from
// 1987 (https://www.netlib.org/specfun/erf). See the AMS publication
// "Rational Chebyshev Approximations for the Error Function" by W. J.
// Cody for an explanation of this process.
function erf(x: number) {
  const y = Math.abs(x);
  if (y >= MAX_NUM) return Math.sign(x);
  if (y <= THRESH) return Math.sign(x) * erf1(y);
  if (y <= 4.0) return Math.sign(x) * (1 - erfc2(y));
  return Math.sign(x) * (1 - erfc3(y));
}

// Approximates the error function erf() for x <= 0.46875 using this
// function:
//               n
// erf(x) = x * sum (p_j * x^(2j)) / (q_j * x^(2j))
//              j=0
function erf1(y: number) {
  const ysq = y * y;
  let xnum = P[0][4] * ysq;
  let xden = ysq;

  for (let i = 0; i < 3; i += 1) {
    xnum = (xnum + P[0][i]) * ysq;
    xden = (xden + Q[0][i]) * ysq;
  }

  return (y * (xnum + P[0][3])) / (xden + Q[0][3]);
}

// Approximates the complement of the error function erfc() for
// 0.46875 <= x <= 4.0 using this function:
//                       n
// erfc(x) = e^(-x^2) * sum (p_j * x^j) / (q_j * x^j)
//                      j=0
function erfc2(y: number) {
  let xnum = P[1][8] * y;
  let xden = y;

  for (let i = 0; i < 7; i += 1) {
    xnum = (xnum + P[1][i]) * y;
    xden = (xden + Q[1][i]) * y;
  }

  const result = (xnum + P[1][7]) / (xden + Q[1][7]);
  const ysq = Math.floor(y * 16) / 16;
  const del = (y - ysq) * (y + ysq);
  return Math.exp(-ysq * ysq) * Math.exp(-del) * result;
}

// Approximates the complement of the error function erfc() for x > 4.0
// using this function:
//
// erfc(x) = (e^(-x^2) / x) * [ 1/sqrt(pi) +
//               n
//    1/(x^2) * sum (p_j * x^(-2j)) / (q_j * x^(-2j)) ]
//              j=0
function erfc3(y: number) {
  let ysq = 1 / (y * y);
  let xnum = P[2][5] * ysq;
  let xden = ysq;

  for (let i = 0; i < 4; i += 1) {
    xnum = (xnum + P[2][i]) * ysq;
    xden = (xden + Q[2][i]) * ysq;
  }

  let result = (ysq * (xnum + P[2][4])) / (xden + Q[2][4]);
  result = (SQRPI - result) / y;
  ysq = Math.floor(y * 16) / 16;
  const del = (y - ysq) * (y + ysq);
  return Math.exp(-ysq * ysq) * Math.exp(-del) * result;
}
