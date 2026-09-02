import { describe, expect, it } from "vitest";

import { appendProjectPage } from "./project-pagination";

describe("project list pagination", () => {
  it("appends exactly one page while preserving order and removing cursor-boundary duplicates", () => {
    const firstPage = [{ id: "project-a" }, { id: "project-b" }];
    const secondPage = [{ id: "project-b" }, { id: "project-c" }, { id: "project-c" }];

    expect(appendProjectPage(firstPage, secondPage)).toEqual([
      { id: "project-a" },
      { id: "project-b" },
      { id: "project-c" }
    ]);
  });

  it("does not mutate either page", () => {
    const firstPage = Object.freeze([{ id: "project-a" }]);
    const secondPage = Object.freeze([{ id: "project-b" }]);

    appendProjectPage(firstPage, secondPage);

    expect(firstPage).toEqual([{ id: "project-a" }]);
    expect(secondPage).toEqual([{ id: "project-b" }]);
  });
});
