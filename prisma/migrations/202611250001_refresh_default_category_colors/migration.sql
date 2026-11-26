-- Refresh system categories that still use their previous default color pair.
UPDATE "categories"
SET "color_light" = '#795548', "color_dark" = '#bc9b80'
WHERE "id" = 'Housing@__system/category__'
  AND "color_light" = '#1976d2' AND "color_dark" = '#90caf9';

UPDATE "categories"
SET "color_light" = '#c2185b', "color_dark" = '#f48fb1'
WHERE "id" = 'Shopping@__system/category__'
  AND "color_light" = '#9c27b0' AND "color_dark" = '#e1bee7';

UPDATE "categories"
SET "color_light" = '#6d28d9', "color_dark" = '#8b5cf6'
WHERE "id" = 'Entertainment@__system/category__'
  AND "color_light" = '#3f51b5' AND "color_dark" = '#c5cae9';

UPDATE "categories"
SET "color_light" = '#00796b', "color_dark" = '#4dd0b9'
WHERE "id" = 'Hobbies@__system/category__'
  AND "color_light" = '#ff9800' AND "color_dark" = '#ffcc80';

UPDATE "categories"
SET "color_light" = '#365314', "color_dark" = '#4d7c0f'
WHERE "id" = 'Education@__system/category__'
  AND "color_light" = '#f44336' AND "color_dark" = '#ef5350';

UPDATE "categories"
SET "color_light" = '#f44336', "color_dark" = '#ef5350'
WHERE "id" = 'Health & Fitness@__system/category__'
  AND "color_light" = '#ff5722' AND "color_dark" = '#ffccbc';

UPDATE "categories"
SET "color_light" = '#a68a00', "color_dark" = '#f3e85c'
WHERE "id" = 'Savings & Investments@__system/category__'
  AND "color_light" = '#4caf50' AND "color_dark" = '#a5d6a7';

UPDATE "categories"
SET "color_light" = '#0891b2', "color_dark" = '#67e8f9'
WHERE "id" = 'Travelling@__system/category__'
  AND "color_light" = '#1976d2' AND "color_dark" = '#90caf9';

UPDATE "categories"
SET "color_light" = '#c026d3', "color_dark" = '#d946ef'
WHERE "id" = 'Special Occasions@__system/category__'
  AND "color_light" = '#f44336' AND "color_dark" = '#ef5350';

UPDATE "categories"
SET "color_light" = '#27272a', "color_dark" = '#71717a'
WHERE "id" = 'Utilities@__system/category__'
  AND "color_light" = '#607d8b' AND "color_dark" = '#b0bec5';
