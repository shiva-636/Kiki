// Server-only data. Never sent to clients in bulk — only single assigned
// values are ever returned to a specific authenticated player.

// Imposter word pairs: [normalWord, imposterWord]. Chosen to be related
// enough that clue-giving is interesting, distinct enough to be guessable.
export const WORD_PAIRS = [
  ['Pizza', 'Burger'],
  ['Beach', 'Desert'],
  ['Coffee', 'Tea'],
  ['Cat', 'Dog'],
  ['Guitar', 'Violin'],
  ['Winter', 'Autumn'],
  ['Doctor', 'Nurse'],
  ['Batman', 'Superman'],
  ['Football', 'Rugby'],
  ['Netflix', 'YouTube'],
  ['Moon', 'Sun'],
  ['Pasta', 'Rice'],
  ['Ocean', 'Lake'],
  ['iPhone', 'Android'],
  ['Wine', 'Beer'],
  ['Mountain', 'Hill'],
  ['Train', 'Bus'],
  ['Chess', 'Checkers'],
  ['Painter', 'Sculptor'],
  ['Volcano', 'Earthquake'],
  ['Library', 'Bookstore'],
  ['Sushi', 'Ramen'],
  ['Castle', 'Palace'],
  ['Wizard', 'Witch'],
  ['Rocket', 'Airplane'],
  ['Diamond', 'Gold'],
  ['Tiger', 'Lion'],
  ['Snow', 'Rain'],
  ['Piano', 'Drums'],
  ['Camera', 'Telescope'],
  ['Butterfly', 'Bee'],
  ['Pirate', 'Ninja'],
  ['Sandwich', 'Taco'],
  ['Circus', 'Carnival'],
  ['Robot', 'Alien'],
  ['Waterfall', 'Geyser'],
  ['Skyscraper', 'Bridge'],
  ['Marathon', 'Triathlon'],
  ['Cupcake', 'Donut'],
  ['Jungle', 'Forest'],
];

// Three Set card names — one pool, dealt out as needed (up to 10 sets for
// a 10-player room).
export const SET_NAMES = [
  'Lion', 'Tiger', 'Elephant', 'Fox', 'Wolf',
  'Panda', 'Eagle', 'Shark', 'Falcon', 'Dolphin',
];
