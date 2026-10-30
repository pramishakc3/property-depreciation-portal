import { expect, test, type Page } from '@playwright/test';

const PASSWORD = 'demo-password-2026';

async function signIn(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Pipeline' })).toBeVisible();
}

test('customer request goes through to a calculated schedule', async ({ page }) => {
  const suburb = `Testville${Date.now() % 100000}`;

  // 1. Customer submits the public form (validation first)
  await page.goto('/');
  await page.getByRole('button', { name: 'Request my report' }).click();
  await expect(page.getByText('Please enter your name')).toBeVisible();

  await page.getByLabel('Full name').fill('Erin Example');
  await page.getByLabel('Email').fill('erin@example.com');
  await page.getByLabel('Phone').fill('0412 345 678');
  await page.getByLabel('Street address').fill('8 Flemington Rd');
  await page.getByLabel('Suburb').fill(suburb);
  await page.getByLabel('Postcode').fill('2140');
  await page.getByLabel('Settlement date').fill('2025-07-01');
  await page.getByLabel('Purchase price ($)').fill('780000');
  await page.getByLabel('Year built').fill('2018');
  await page.getByRole('button', { name: 'Request my report' }).click();
  const reference = (await page.getByTestId('reference').textContent())!;
  expect(reference).toMatch(/^PD-\d{4}-\d{5}$/);

  // 2. Surveyor finds the job, claims it and books the inspection
  await signIn(page, 'surveyor@example.com');
  await page.getByRole('link', { name: 'Jobs', exact: true }).click();
  await page.getByLabel('Search jobs').fill(reference);
  await page.getByRole('link', { name: reference }).click();
  await expect(page.getByRole('heading', { name: `8 Flemington Rd, ${suburb}` })).toBeVisible();

  await page.getByRole('button', { name: 'Assign to me' }).click();
  // Wait for the job to reload with the new surveyor before editing the next field
  await expect(page.getByRole('button', { name: 'Assign to me' })).toHaveCount(0);
  await expect(page.locator('.details dd').filter({ hasText: 'Sam Surveyor' })).toBeVisible();
  await page.getByLabel('Inspection date').fill('2026-11-20');
  await page.getByRole('button', { name: 'Move to Inspection booked' }).click();
  await expect(page.locator('.page-head .badge')).toHaveText('Inspection booked');

  // 3. Add a preset item; the effective life fills in automatically
  await page.getByLabel('Item').fill('Carpet');
  await expect(page.getByLabel('Effective life (years)')).toHaveValue('8');
  await page.getByLabel('Cost ($)').fill('4000');
  await page.getByRole('button', { name: 'Add item' }).click();
  await expect(page.getByRole('cell', { name: 'Carpet', exact: true })).toBeVisible();

  // 4. Schedule: 4000 x 200% / 8 = $1,000 in the first full year
  await expect(page.getByRole('row', { name: /2025-26/ })).toContainText('$1,000.00');
  await expect(page.getByRole('link', { name: 'Download CSV' })).toHaveAttribute('href', /schedule\.csv/);
});

test('viewers have read-only access and no admin area', async ({ page }) => {
  await signIn(page, 'viewer@example.com');
  await expect(page.getByRole('link', { name: 'Admin' })).toHaveCount(0);
  await page.goto('/app/admin');
  await expect(page).toHaveURL(/\/app$/);

  await page.goto('/app/jobs');
  await page.locator('a.ref').first().click();
  await expect(page.getByText('You have read-only access.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add item' })).toHaveCount(0);
});

test('signed-out users are sent to the sign-in page', async ({ page }) => {
  await page.goto('/app/jobs');
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel('Email').fill('surveyor@example.com');
  await page.getByLabel('Password').fill('wrong-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toHaveText('Incorrect email or password');
});
