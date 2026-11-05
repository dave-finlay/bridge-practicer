// Double dummy tables from DDS, for scripts/dd.mjs.
//
// Reads one deal per line: "<dealer> <vul> N:<north> <east> <south> <west>",
// with dealer 0-3 (N E S W) and vul 0-3 (None, Both, NS, EW), as DDS
// numbers them. Writes one JSON line per deal:
//   {"tricks":[[N,E,S,W] for S,H,D,C,NT], "par":<score for N-S>,
//    "contracts":["4S*-EW-1", ...]}
//
// Or, for the opening lead, "L <leader> <trump> N:<north> ...", with the
// leader 0-3 and trump 0-4 (S H D C NT). Writes the tricks the defense
// takes after each card the leader could lead:
//   {"lead":{"SA":4,"S7":3,...}}

#include <api/dll.h>

#include <cstdio>
#include <cstring>
#include <iostream>
#include <string>

// Every card the leader could lead, with the defense's tricks after it.
// DDS lists one card per group of equals, with the rest of the group as
// a bit per rank (bit r for rank r, 2-14).
static int leadLine(const std::string& line) {
  int leader = 0, trump = 0, offset = 0;
  if (std::sscanf(line.c_str(), "L %d %d %n", &leader, &trump, &offset) != 2) {
    std::cerr << "bad line: " << line << "\n";
    return 1;
  }
  DealPBN deal{};
  deal.trump = trump;
  deal.first = leader;
  std::strncpy(deal.remainCards, line.c_str() + offset, sizeof deal.remainCards - 1);

  FutureTricks future{};
  int status = SolveBoardPBN(deal, -1, 3, 0, &future, 0);
  if (status != 1) {
    std::cerr << "DDS error " << status << ": " << line << "\n";
    return 1;
  }
  const char* suits = "SHDC";
  const char* ranks = "--23456789TJQKA";
  std::cout << "{\"lead\":{";
  bool first = true;
  for (int i = 0; i < future.cards; i++) {
    for (int rank = 2; rank <= 14; rank++) {
      if (rank != future.rank[i] && !(future.equals[i] & (1 << rank))) continue;
      std::cout << (first ? "" : ",") << "\"" << suits[future.suit[i]] << ranks[rank] << "\":" << future.score[i];
      first = false;
    }
  }
  std::cout << "}}\n";
  return 0;
}

int main() {
  std::string line;
  while (std::getline(std::cin, line)) {
    if (line[0] == 'L') {
      if (leadLine(line)) return 1;
      continue;
    }
    int dealer = 0, vul = 0, offset = 0;
    if (std::sscanf(line.c_str(), "%d %d %n", &dealer, &vul, &offset) != 2) {
      std::cerr << "bad line: " << line << "\n";
      return 1;
    }
    DdTableDealPBN deal{};
    std::strncpy(deal.cards, line.c_str() + offset, sizeof deal.cards - 1);

    DdTableResults table{};
    int status = CalcDDtablePBN(deal, &table);
    if (status != 1) {
      std::cerr << "DDS error " << status << ": " << line << "\n";
      return 1;
    }
    ParResultsDealer par{};
    status = DealerPar(&table, &par, dealer, vul);
    if (status != 1) {
      std::cerr << "DDS par error " << status << ": " << line << "\n";
      return 1;
    }

    std::cout << "{\"tricks\":[";
    for (int strain = 0; strain < 5; strain++) {
      std::cout << (strain ? "," : "") << "[";
      for (int hand = 0; hand < 4; hand++) {
        std::cout << (hand ? "," : "") << table.res_table[strain][hand];
      }
      std::cout << "]";
    }
    std::cout << "],\"par\":" << par.score << ",\"contracts\":[";
    for (int i = 0; i < par.number; i++) {
      std::cout << (i ? "," : "") << "\"" << par.contracts[i] << "\"";
    }
    std::cout << "]}\n";
  }
  return 0;
}
