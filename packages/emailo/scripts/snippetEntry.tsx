import React from "react";
import ReactDOM from "react-dom/client";

import { Emailo, useEmailo } from "../src/emailo";

const root = document.getElementById("root");
if (!root) {
  throw new Error("No root element found");
}

const content = `
<h2>
  Hi there,
</h2>
<p>
  this is a <em>basic</em> example of <strong>Tiptap</strong>. Sure, there are all kind of basic text styles you'd probably expect from a text editor. But wait until you see the lists:
</p>
<ul>
  <li>
    That's a bullet list with one …
  </li>
  <li>
    … or two list items.
  </li>
</ul>
<p>
  Isn't that great? And all of that is editable. But wait, there's more. Let's try a code block:
</p>
<pre><code class="language-css">body {
  display: none;
}</code></pre>
<p>
  I know, I know, this is impressive. It's only the tip of the iceberg though. Give it a try and click a little bit around. Don't forget to check the other examples too.
</p>
<blockquote>
  Wow, that's amazing. Good work, boy! 👏
  <br />
  — Mom
</blockquote>
`;

function Main() {
  const state = useEmailo({ content });
  return (
    <div className="flex flex-col space-y-4">
      <div className="flex items-center justify-center w-full">
        <div>header</div>
      </div>
      <div>
        <Emailo state={state} />
      </div>
    </div>
  );
}

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <Main />
  </React.StrictMode>,
);
