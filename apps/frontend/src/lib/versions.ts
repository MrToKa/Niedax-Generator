import applicationPackage from "../../../../package.json" with { type: "json" };
import catalogueManifest from "../../../../catalogue/manifest.json" with { type: "json" };
import rulesManifest from "../../../../rules/manifest.json" with { type: "json" };

export const versions = Object.freeze({
  application: applicationPackage.version,
  catalogue: catalogueManifest.version,
  rules: rulesManifest.version
});
