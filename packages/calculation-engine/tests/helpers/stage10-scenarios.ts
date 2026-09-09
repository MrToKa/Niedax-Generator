import { allMajorRulesInputV2 } from "./fixture-v2.js";
import {
  addBend,
  connectRoutes,
  manualItem,
  metadata,
  product,
  required,
  straightInput,
  type TestInput
} from "./stage10-fixtures.js";

function sourceProduct(
  input: TestInput,
  id: string,
  code: string,
  pack: string,
  page: string
): void {
  const item = product(input, id);
  item.code = code;
  item.packageIncrement = { value: pack, unit: item.orderUnit };
  item.source = {
    kind: "catalogDocument",
    id: `p0-fact-${id}`,
    sourceDocument: page.startsWith("KR")
      ? "KAT_NX_KR 2022.pdf"
      : "1.-Electrical-installation-materials.pdf",
    sourcePage: page
  };
}

function anchorCase(code: string, pack: string, page = "156"): TestInput {
  const input = straightInput();
  sourceProduct(input, "product-anchor", code, pack, page);
  return input;
}

/** Scenario inputs are executable source fixtures. Only product facts explicitly cited below are P0. */
export const stage10Scenarios: Readonly<Record<string, () => TestInput>> = {
  T01: () => {
    const input = straightInput(["100"]);
    sourceProduct(input, "product-straight", "KL 60.203", "6", "KR 340");
    sourceProduct(input, "product-support", "KLTB 6", "50", "KR 355");
    sourceProduct(input, "product-anchor", "DAM 6X5", "50", "156");
    required(input.project.routes[0]).supports.wstbProductId = null;
    return input;
  },
  T02: () => {
    const input = straightInput(["100"]);
    sourceProduct(input, "product-straight", "WSL 105.200", "6", "KR 426");
    sourceProduct(input, "product-wstb", "WSTB 2", "50", "KR 449");
    return input;
  },
  T03: () => straightInput(["6", "8.5"]),
  T04: () => {
    const input = straightInput();
    connectRoutes(input, 2);
    return input;
  },
  T05: () => {
    const input = straightInput();
    connectRoutes(input, 2, true);
    return input;
  },
  T06: () => {
    const input = straightInput(["3.1", "2.9"]);
    addBend(input);
    required(input.project.routes[0]).supports.manualAdditionalSupports.push({
      id: "manual-bend-supports",
      originalCalculatedQuantity: { value: "6", unit: "pcs" },
      additionalQuantity: { value: "2", unit: "pcs" },
      sourceEntityRef: "bend-0",
      metadata: metadata("manual-bend-supports")
    });
    return input;
  },
  T07: () => {
    const input = straightInput();
    connectRoutes(input, 3, true);
    input.project.connections = [required(input.project.connections[0])];
    const connection = required(input.project.connections[0]);
    connection.type = "tee";
    connection.participants.push({ routeId: "route-2", endpointId: "endpoint-2-start" });
    const middle = required(input.project.routes[1]);
    middle.endEndpoint.type = "freeEnd";
    middle.endEndpoint.connectionId = null;
    required(input.project.routes[2]).startEndpoint.connectionId = connection.id;
    input.rules = input.rules.filter((rule) => rule.id !== "physical-rule-1");
    const rule = required(input.rules.find((candidate) => candidate.type === "physicalConnection"));
    if (rule.type === "physicalConnection") required(rule.components[0]).portOrSideCount = "3";
    return input;
  },
  T08: () => {
    const input = straightInput(),
      route = required(input.project.routes[0]);
    route.startEndpoint.type = "endCap";
    route.startEndpoint.materialRuleId = "rule-endcap-a";
    route.endEndpoint.type = "equipment";
    const rule = required(
      allMajorRulesInputV2.rules.find((candidate) => candidate.type === "endpointMaterial")
    );
    input.rules.push(structuredClone(rule));
    return input;
  },
  "T09-DAM": () => anchorCase("DAM 6X5", "50"),
  "T09-DAZ": () => anchorCase("DAZ 8X10", "50"),
  T10: () => anchorCase("NSA 6X35/FKK-T30 V", "100", "157"),
  T11: () => {
    const input = straightInput(["100"]);
    input.project.defaultReservePercent = "5";
    product(input, "product-straight").packageIncrement = { value: "24", unit: "m" };
    return input;
  },
  T12: () => {
    const input = straightInput();
    input.project.defaultReservePercent = "5";
    const catalog = structuredClone(
      required(allMajorRulesInputV2.manualItems.find((item) => item.kind === "catalog"))
    );
    input.manualItems = [catalog, manualItem()];
    product(input, "product-manual-catalog").packageIncrement = { value: "10", unit: "pcs" };
    return input;
  }
};
