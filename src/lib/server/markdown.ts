import createDOMPurify from 'dompurify';
import matter from 'gray-matter';
import { JSDOM } from 'jsdom';
import { marked } from 'marked';

const window = new JSDOM('').window;
const purify = createDOMPurify(window);

marked.use({
  gfm: true,
  breaks: false
});

export const renderMarkdown = async (markdown: string) => {
  const parsed = matter(markdown);
  const html = await marked.parse(parsed.content);

  return {
    frontmatter: parsed.data,
    html: purify.sanitize(html)
  };
};
