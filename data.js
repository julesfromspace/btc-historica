// Approximate monthly closing prices for BTC/USD (USD per BTC).
// Sourced from public historical price data; values are approximate
// month-end closes used to drive a monthly candlestick chart.
const BTC_MONTHLY_CLOSES = [
  ["2010-07-01", 0.08],   ["2010-08-01", 0.07],   ["2010-09-01", 0.06],
  ["2010-10-01", 0.20],   ["2010-11-01", 0.27],   ["2010-12-01", 0.30],
  ["2011-01-01", 0.34],   ["2011-02-01", 0.95],   ["2011-03-01", 0.79],
  ["2011-04-01", 1.73],   ["2011-05-01", 8.15],   ["2011-06-01", 15.40],
  ["2011-07-01", 13.86],  ["2011-08-01", 8.65],   ["2011-09-01", 4.85],
  ["2011-10-01", 3.29],   ["2011-11-01", 2.55],   ["2011-12-01", 4.25],
  ["2012-01-01", 5.55],   ["2012-02-01", 4.85],   ["2012-03-01", 4.94],
  ["2012-04-01", 4.95],   ["2012-05-01", 5.16],   ["2012-06-01", 6.66],
  ["2012-07-01", 9.05],   ["2012-08-01", 10.30],  ["2012-09-01", 12.35],
  ["2012-10-01", 11.30],  ["2012-11-01", 12.48],  ["2012-12-01", 13.45],
  ["2013-01-01", 20.36],  ["2013-02-01", 33.49],  ["2013-03-01", 93.03],
  ["2013-04-01", 139.00], ["2013-05-01", 128.85], ["2013-06-01", 96.23],
  ["2013-07-01", 96.50],  ["2013-08-01", 134.11], ["2013-09-01", 124.60],
  ["2013-10-01", 199.50], ["2013-11-01", 1126.00],["2013-12-01", 754.97],
  ["2014-01-01", 829.99], ["2014-02-01", 561.00], ["2014-03-01", 449.00],
  ["2014-04-01", 458.00], ["2014-05-01", 624.00], ["2014-06-01", 633.00],
  ["2014-07-01", 581.00], ["2014-08-01", 478.00], ["2014-09-01", 386.00],
  ["2014-10-01", 335.00], ["2014-11-01", 379.00], ["2014-12-01", 318.00],
  ["2015-01-01", 218.00], ["2015-02-01", 254.00], ["2015-03-01", 244.00],
  ["2015-04-01", 235.00], ["2015-05-01", 230.00], ["2015-06-01", 263.00],
  ["2015-07-01", 285.00], ["2015-08-01", 230.00], ["2015-09-01", 236.00],
  ["2015-10-01", 314.00], ["2015-11-01", 377.00], ["2015-12-01", 430.00],
  ["2016-01-01", 369.00], ["2016-02-01", 437.00], ["2016-03-01", 416.00],
  ["2016-04-01", 449.00], ["2016-05-01", 531.00], ["2016-06-01", 671.00],
  ["2016-07-01", 624.00], ["2016-08-01", 575.00], ["2016-09-01", 609.00],
  ["2016-10-01", 700.00], ["2016-11-01", 745.00], ["2016-12-01", 963.00],
  ["2017-01-01", 970.00], ["2017-02-01", 1180.00],["2017-03-01", 1071.00],
  ["2017-04-01", 1348.00],["2017-05-01", 2286.00],["2017-06-01", 2480.00],
  ["2017-07-01", 2875.00],["2017-08-01", 4732.00],["2017-09-01", 4338.00],
  ["2017-10-01", 6438.00],["2017-11-01", 10233.00],["2017-12-01", 14156.00],
  ["2018-01-01", 10221.00],["2018-02-01", 10397.00],["2018-03-01", 6928.00],
  ["2018-04-01", 9252.00],["2018-05-01", 7494.00],["2018-06-01", 6404.00],
  ["2018-07-01", 7780.00],["2018-08-01", 7037.00],["2018-09-01", 6625.00],
  ["2018-10-01", 6371.00],["2018-11-01", 4017.00],["2018-12-01", 3742.00],
  ["2019-01-01", 3437.00],["2019-02-01", 3854.00],["2019-03-01", 4105.00],
  ["2019-04-01", 5350.00],["2019-05-01", 8557.00],["2019-06-01", 10818.00],
  ["2019-07-01", 10082.00],["2019-08-01", 9614.00],["2019-09-01", 8294.00],
  ["2019-10-01", 9199.00],["2019-11-01", 7569.00],["2019-12-01", 7194.00],
  ["2020-01-01", 9351.00],["2020-02-01", 8599.00],["2020-03-01", 6438.00],
  ["2020-04-01", 8629.00],["2020-05-01", 9461.00],["2020-06-01", 9137.00],
  ["2020-07-01", 11328.00],["2020-08-01", 11645.00],["2020-09-01", 10785.00],
  ["2020-10-01", 13780.00],["2020-11-01", 19698.00],["2020-12-01", 28990.00],
  ["2021-01-01", 33114.00],["2021-02-01", 45137.00],["2021-03-01", 58788.00],
  ["2021-04-01", 57828.00],["2021-05-01", 37332.00],["2021-06-01", 35040.00],
  ["2021-07-01", 41468.00],["2021-08-01", 47131.00],["2021-09-01", 43824.00],
  ["2021-10-01", 61300.00],["2021-11-01", 56950.00],["2021-12-01", 46306.00],
  ["2022-01-01", 38491.00],["2022-02-01", 43160.00],["2022-03-01", 45538.00],
  ["2022-04-01", 37630.00],["2022-05-01", 31791.00],["2022-06-01", 19785.00],
  ["2022-07-01", 23290.00],["2022-08-01", 20049.00],["2022-09-01", 19421.00],
  ["2022-10-01", 20492.00],["2022-11-01", 17163.00],["2022-12-01", 16547.00],
  ["2023-01-01", 23125.00],["2023-02-01", 23147.00],["2023-03-01", 28465.00],
  ["2023-04-01", 29234.00],["2023-05-01", 27219.00],["2023-06-01", 30471.00],
  ["2023-07-01", 29230.00],["2023-08-01", 25931.00],["2023-09-01", 26967.00],
  ["2023-10-01", 34667.00],["2023-11-01", 37718.00],["2023-12-01", 42265.00],
  ["2024-01-01", 42580.00],["2024-02-01", 61198.00],["2024-03-01", 71333.00],
  ["2024-04-01", 60636.00],["2024-05-01", 67492.00],["2024-06-01", 62678.00],
  ["2024-07-01", 64628.00],["2024-08-01", 58970.00],["2024-09-01", 63329.00],
  ["2024-10-01", 70218.00],["2024-11-01", 96449.00],["2024-12-01", 93429.00],
  ["2025-01-01", 102429.00],["2025-02-01", 84347.00],["2025-03-01", 82534.00],
  ["2025-04-01", 94000.00]
];

// Deterministic pseudo-random for OHLC generation, seeded by index.
// Keeps the chart stable across reloads.
function _rand(i) {
  const x = Math.sin(i * 99.137 + 12.4521) * 43758.5453;
  return x - Math.floor(x);
}

// Build OHLC monthly candles from the close-only series.
// open  = previous close
// close = month close
// high/low = bounded random walk around the open->close trajectory,
//            scaled by the magnitude of the move so volatile months
//            produce fatter wicks.
const BTC_DATA = (() => {
  const out = [];
  for (let i = 0; i < BTC_MONTHLY_CLOSES.length; i++) {
    const [date, close] = BTC_MONTHLY_CLOSES[i];
    const prevClose = i > 0 ? BTC_MONTHLY_CLOSES[i - 1][1] : close * 0.92;
    const open = prevClose;
    const ratio = close / open;
    const volatility = Math.max(0.08, Math.min(0.5, Math.abs(Math.log(ratio)) * 0.6));
    const r1 = _rand(i * 2 + 1);
    const r2 = _rand(i * 2 + 7);
    const upperExtra = volatility * (0.4 + 0.7 * r1);
    const lowerExtra = volatility * (0.4 + 0.7 * r2);
    const high = Math.max(open, close) * (1 + upperExtra);
    const low  = Math.min(open, close) * (1 - lowerExtra);
    out.push({ time: date, open, high, low: Math.max(low, 0.001), close });
  }
  return out;
})();

// Major historical events. Titles are short — clamped to 3 lines on display.
const EVENTS = [
  { date: "2010-07-01", title: "Mt. Gox Bitcoin exchange launches" },
  { date: "2010-12-01", title: "Satoshi Nakamoto goes silent, never to post again" },
  { date: "2011-06-01", title: "Mt. Gox suffers its first major hack" },
  { date: "2012-11-01", title: "1st Halving (25 Bitcoin block reward)", halving: true },
  { date: "2013-04-01", title: "Bitcoin crosses $100 for the first time" },
  { date: "2013-11-01", title: "Bitcoin briefly tops $1,000 amid retail mania" },
  { date: "2014-02-01", title: "Mt. Gox collapses with 850,000 BTC missing" },
  { date: "2016-07-01", title: "2nd Halving (12.5 Bitcoin block reward)", halving: true },
  { date: "2017-08-01", title: "SegWit activates and Bitcoin Cash forks off" },
  { date: "2017-12-01", title: "Bitcoin nears $20,000 in the first major retail bubble" },
  { date: "2018-12-01", title: "Bear market bottoms near $3,200" },
  { date: "2019-06-01", title: "Facebook unveils Libra, drawing global regulator scrutiny" },
  { date: "2020-03-01", title: "WHO declares COVID-19 a worldwide pandemic" },
  { date: "2020-05-01", title: "3rd Halving (6.25 Bitcoin block reward)", halving: true },
  { date: "2020-08-01", title: "MicroStrategy announces $250M Bitcoin treasury allocation" },
  { date: "2020-10-01", title: "PayPal lets US users buy and hold cryptocurrencies" },
  { date: "2021-02-01", title: "Tesla discloses a $1.5B Bitcoin purchase" },
  { date: "2021-04-01", title: "Coinbase IPOs on Nasdaq as BTC tags new highs" },
  { date: "2021-05-01", title: "China bans Bitcoin mining, triggering a crash" },
  { date: "2021-09-01", title: "El Salvador adopts Bitcoin as legal tender" },
  { date: "2021-11-01", title: "Bitcoin reaches its all-time high near $69,000" },
  { date: "2022-05-01", title: "Terra/Luna stablecoin ecosystem collapses overnight" },
  { date: "2022-06-01", title: "Celsius freezes withdrawals; Three Arrows Capital fails" },
  { date: "2022-11-01", title: "FTX implodes and Sam Bankman-Fried is arrested" },
  { date: "2023-03-01", title: "US banking crisis — Silvergate, SVB, and Signature fail" },
  { date: "2023-06-01", title: "BlackRock files for a spot Bitcoin ETF" },
  { date: "2024-01-01", title: "SEC approves the first US spot Bitcoin ETFs" },
  { date: "2024-03-01", title: "Bitcoin breaks its 2021 all-time high" },
  { date: "2024-04-01", title: "4th Halving (3.125 Bitcoin block reward)", halving: true },
  { date: "2024-11-01", title: "Trump elected; Bitcoin surges past $100,000" },
  { date: "2025-01-01", title: "Bitcoin sets a new all-time high near $109,000" }
];
