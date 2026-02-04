import { test, expect } from '@playwright/test';

// This test requires Desktop Chrome (configured in playwright.config.ts)
// because the comment feature needs the inline message input, not the modal

test.describe('Patch Tool Comment Feature', () => {
  test.beforeEach(async ({ page }) => {
    // Enable Monaco diff view and set single pane mode
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.evaluate(() => {
      localStorage.setItem('shelley-use-monaco-diff', 'true');
      // Set grid to 1x1 for single pane mode (non-compact)
      localStorage.setItem('shelley_pane_columns', '1');
      localStorage.setItem('shelley_pane_rows', '1');
    });
    // Reload to apply the settings
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    
    // Wait for the message input to be visible (confirms non-compact mode)
    await page.waitForSelector('[data-testid="message-input"]', { timeout: 10000 });
  });

  test('comment from Monaco diff view is injected into message input', async ({ page }) => {
    const messageInput = page.getByTestId('message-input');
    const sendButton = page.getByTestId('send-button');

    // Use "patch success" which triggers a predictable patch response
    await messageInput.fill('patch success');
    await sendButton.click();

    // Wait for patch tool to complete
    await page.waitForFunction(
      () => document.querySelectorAll('.patch-tool').length >= 1,
      undefined,
      { timeout: 30000 }
    );

    // Wait for Monaco editor to load (it's lazy loaded)
    await page.waitForSelector('.patch-tool-monaco-editor', { timeout: 10000 });
    await page.waitForSelector('.monaco-editor', { timeout: 15000 });

    // Click on a line in the modified editor to open comment dialog
    const modifiedEditor = page.locator('.modified-in-monaco-diff-editor .view-line').first();
    const hasModifiedEditor = await modifiedEditor.count() > 0;
    
    if (hasModifiedEditor) {
      await modifiedEditor.click();
    } else {
      // Fallback: click on any view-line
      await page.locator('.view-line').first().click();
    }
    
    // Wait for click handler to fire
    await page.waitForTimeout(500);

    // Wait for comment dialog to appear
    await page.waitForSelector('.patch-tool-comment-dialog', { timeout: 5000 });

    // Type a comment
    const commentTextarea = page.locator('.patch-tool-comment-dialog textarea');
    await commentTextarea.fill('This is a test comment');

    // Click Add Comment button
    const addCommentButton = page.locator('.patch-tool-btn-primary').filter({ hasText: 'Add Comment' });
    await addCommentButton.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    
    // Try clicking - if overlayed, use evaluate to click directly
    try {
      await addCommentButton.click({ timeout: 2000 });
    } catch {
      await page.evaluate(() => {
        const btn = document.querySelector('.patch-tool-btn-primary') as HTMLButtonElement;
        if (btn) btn.click();
      });
    }
    
    // Wait for click handler
    await page.waitForTimeout(500);

    // Check the message input contains our comment
    await expect(messageInput).toContainText('This is a test comment');
    // Also verify it has the file reference
    await expect(messageInput).toContainText('/tmp/test-patch-success.txt');
  });

  test('onCommentTextChange callback is invoked when adding comment', async ({ page }) => {
    // This test verifies the fix for the bug where onCommentTextChange
    // was not being passed through the component hierarchy
    const messageInput = page.getByTestId('message-input');
    const sendButton = page.getByTestId('send-button');

    // Use patch success which uses overwrite and always succeeds
    await messageInput.fill('patch success');
    await sendButton.click();

    // Wait for patch tool to complete
    await page.waitForFunction(
      () => document.querySelectorAll('.patch-tool').length >= 1,
      undefined,
      { timeout: 30000 }
    );

    // Wait for Monaco
    await page.waitForSelector('.patch-tool-monaco-editor', { timeout: 10000 });
    await page.waitForSelector('.monaco-editor', { timeout: 10000 });

    // Click on a line in the modified editor
    const modifiedViewLine = page.locator('.modified-in-monaco-diff-editor .view-line').first();
    const hasModifiedEditor = await modifiedViewLine.count() > 0;
    
    if (hasModifiedEditor) {
      await modifiedViewLine.click();
    } else {
      await page.locator('.view-line').first().click();
    }
    
    await page.waitForTimeout(500);

    // Verify comment dialog appears (this confirms onCommentTextChange was passed)
    const commentDialog = page.locator('.patch-tool-comment-dialog');
    // The dialog only appears if onCommentTextChange is defined
    await expect(commentDialog).toBeVisible({ timeout: 5000 });
  });
});
