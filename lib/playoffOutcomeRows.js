const kinds = ["out", "hunt", "clinch"];

export function encodeOutcomeRows(entries, teams, games) {
  const winnerBytes = Math.ceil(games.length / 8);
  const rowSize = winnerBytes + teams.length;
  const bytes = new Uint8Array(entries.length * rowSize);

  entries.forEach((entry, row) => {
    const start = row * rowSize;
    games.forEach((game, index) => {
      if (entry.winners[index] === game.homeId) {
        bytes[start + (index >> 3)] |= 1 << (index % 8);
      }
    });
    teams.forEach((team, index) => {
      bytes[start + winnerBytes + index] = kinds.indexOf(entry.kinds.get(team.ownerId));
    });
  });

  return bytes;
}

export function decodeOutcomeRows(encoded, teams, games, count) {
  const bytes = atob(encoded);
  const winnerBytes = Math.ceil(games.length / 8);
  const rowSize = winnerBytes + teams.length;

  return Array.from({ length: count }, (_, row) => {
    const start = row * rowSize;
    return {
      winners: games.map((game, index) =>
        bytes.charCodeAt(start + (index >> 3)) & (1 << (index % 8)) ? game.homeId : game.awayId
      ),
      kinds: new Map(teams.map((team, index) =>
        [team.ownerId, kinds[bytes.charCodeAt(start + winnerBytes + index)]]
      )),
    };
  });
}
