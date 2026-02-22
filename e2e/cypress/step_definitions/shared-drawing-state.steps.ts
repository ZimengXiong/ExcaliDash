import { Then } from "@badeball/cypress-cucumber-preprocessor";
import { getScenario } from "./shared-context";
import { getDrawing } from "./api-helpers";

Then("the drawing should contain at least {int} element", (count: number) => {
  const drawingId = getScenario<string>("drawingId");
  return getDrawing(drawingId).then((drawing) => {
    const length = drawing.elements?.length || 0;
    expect(length).to.be.gte(count);
  });
});
