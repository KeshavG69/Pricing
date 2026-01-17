# Terms and Conditions Content

This directory contains the Terms and Conditions content as React components for easy editing and guaranteed consistent rendering.

## Files

- **`TermsContent.tsx`** - Full Terms and Conditions (legal document)
- **`SummaryContent.tsx`** - Plain-English summary for users
- **EnterpriseAddendumContent.tsx** - Enterprise customer addendum

## How to Edit Content

### 1. Choose the file to edit

Open the appropriate `.tsx` file based on which document you want to update.

### 2. Edit the JSX content

The content is structured using standard HTML elements:

```tsx
<h1>Main Title</h1>           // Level 1 heading with bottom border
<h2>Section Title</h2>        // Level 2 heading
<h3>Subsection Title</h3>     // Level 3 heading
<p>Paragraph text</p>         // Body paragraph
<ul>                          // Unordered list
  <li>List item</li>
</ul>
<strong>Bold text</strong>    // Bold/emphasis
<em>Italic text</em>          // Italic
<a href="...">Link</a>        // Hyperlink
```

### 3. Save the file

Changes will be automatically reflected across:
- Blocking modal when users need to accept terms
- Public terms page at `/legal/terms`
- Any other place that renders terms content

### 4. No build step required

Since these are React components, they're compiled with the rest of the application. Just save and refresh the page in development, or deploy the updated code to production.

## Styling

All styling is handled automatically via Tailwind's `prose` classes. The content components include pre-configured typography styles that match industry standards:

- **Body text**: 15px with 1.75 line height
- **H1**: 30px, bold, with bottom border
- **H2**: 24px, semibold
- **H3**: 20px, semibold
- **Proper spacing**: Consistent margins between sections
- **Colors**: Professional gray scale with blue links

**You don't need to add any CSS classes** - just use semantic HTML elements and the styling is applied automatically.

## Example: Adding a New Section

To add a new section to the Full Terms:

1. Open `TermsContent.tsx`
2. Find where you want to insert the section
3. Add:

```tsx
<h2>16. Your New Section</h2>

<h3>Subsection Name</h3>

<p>
  Your paragraph content here. You can use <strong>bold text</strong> and
  <a href="https://example.com">links</a> as needed.
</p>

<ul>
  <li>First bullet point</li>
  <li>Second bullet point</li>
  <li>Third bullet point</li>
</ul>
```

4. Save the file

## Example: Updating Contact Information

To update contact info in the Full Terms:

1. Open `TermsContent.tsx`
2. Scroll to the bottom
3. Find the "Questions or Contact" section
4. Update the contact details:

```tsx
<h2>Questions or Contact</h2>

<p>
  <strong>Intrepix LLC</strong><br />
  <a href="mailto:newemail@intrepix.org">newemail@intrepix.org</a><br />
  555-123-4567
</p>
```

5. Save the file

## Version Updates

When updating terms to a new version:

1. Edit the content in the appropriate `.tsx` file
2. Update the version number in `/frontend/.env`:
   ```
   NEXT_PUBLIC_TERMS_VERSION=1.1.0
   ```
3. Update the backend version in `/backend/auth/config.py`:
   ```python
   CURRENT_TERMS_VERSION = "1.1.0"
   ```
4. Update the "Last Updated" date in the content:
   ```tsx
   <p><em>Last Updated: 01/15/2026</em></p>
   ```
5. Deploy both frontend and backend

All users with the old version will see the blocking modal on their next login.

## Why React Components Instead of Markdown?

1. **Guaranteed Rendering** - No markdown parsing issues or syntax errors
2. **Better Performance** - No runtime parsing, content is part of the build
3. **Type Safety** - TypeScript catches errors at compile time
4. **Easy Editing** - Just edit HTML-like JSX
5. **Consistent Styling** - Professional typography applied automatically
6. **No Dependencies** - No need for markdown parser library

## Need Help?

If you're not familiar with JSX/React, think of it like HTML with a few differences:
- Use `className` instead of `class`
- Self-closing tags need `/` (e.g., `<br />`)
- Wrap multi-line content in parentheses
- Use curly braces `{}` for JavaScript expressions

The content is just standard HTML elements, so if you can edit HTML, you can edit these files!
