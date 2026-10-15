// Double dummy tables from DDS, for scripts/add-dd.mjs.
//
// Reads one deal per line: "<dealer> <vul> N:<north> <east> <south> <west>",
// with dealer 0-3 (N E S W) and vul 0-3 (None, Both, NS, EW), as DDS
// numbers them. Writes one JSON line per deal:
//   {"tricks":[[N,E,S,W] for S,H,D,C,NT], "par":<score for N-S>,
//    "contracts":["4S*-EW-1", ...]}

#include <api/dll.h>

#include <cstdio>
#include <cstring>
#include <iostream>
#include <string>

int main() {
  std::string line;
  while (std::getline(std::cin, line)) {
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
