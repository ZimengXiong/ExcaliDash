export const scenarioData = new Map<string, unknown>();
export const createdDrawingIds: string[] = [];
export const createdCollectionIds: string[] = [];
export const createdUserIds: string[] = [];

export const setScenario = (key: string, value: unknown) => {
  scenarioData.set(key, value);
};

export const getScenario = <T>(key: string): T => scenarioData.get(key) as T;

export const clearScenario = () => {
  scenarioData.clear();
};
