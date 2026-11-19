/* eslint-disable no-underscore-dangle */
import { isObject } from "isomorphic-lib/src/objects";
import {
  Context,
  Emitter,
  evalToken,
  Hash,
  Tag,
  Template,
  Tokenizer,
  ValueToken,
} from "liquidjs";

import config from "./config";
import logger from "./logger";

/**
 * Compiles a snippet body once and reuses the parsed template until the cache
 * is full. A send renders the same snippets for every recipient, so parsing per
 * message would dominate the cost of a batch.
 */
const snippetTemplateCache = new Map<string, Template[]>();
const MAX_SNIPPET_TEMPLATE_CACHE = 500;

function compileSnippet(liquid: Tag["liquid"], body: string): Template[] {
  const cached = snippetTemplateCache.get(body);
  if (cached) {
    return cached;
  }
  const templates = liquid.parse(body);
  if (snippetTemplateCache.size >= MAX_SNIPPET_TEMPLATE_CACHE) {
    const oldest = snippetTemplateCache.keys().next();
    if (!oldest.done) {
      snippetTemplateCache.delete(oldest.value);
    }
  }
  snippetTemplateCache.set(body, templates);
  return templates;
}

/**
 * Renders a named snippet, the reusable fragment of the content module.
 *
 *   {% snippet "header" %}
 *   {% snippet "product-card", title: item.title, url: item.url %}
 *
 * Snippets are preloaded per send (`loadSnippetsForTemplates`) and passed in on
 * the render scope as `snippets`, keyed by name. A missing snippet renders as
 * empty rather than failing the send, and keyword arguments are pushed as the
 * snippet's scope so a snippet can be parameterized without leaking variables
 * back into the caller.
 *
 * This is an object style tag rather than a `class extends Tag` because the ES5
 * output of this package cannot extend a native class: TypeScript compiles the
 * subclass to `Tag.call(this, ...)`, which throws "Class constructor Tag cannot
 * be invoked without 'new'" at runtime.
 */
export const snippetTag = {
  *render(this: Tag, ctx: Context, emitter: Emitter) {
    const tokenizer = new Tokenizer(
      this.token.args,
      this.liquid.options.operators,
    );
    const nameToken: ValueToken | undefined = tokenizer.readValue();
    const hash = new Hash(tokenizer.remaining());

    const rawName: unknown = nameToken
      ? yield evalToken(nameToken, ctx)
      : undefined;
    const name = typeof rawName === "string" ? rawName : "";
    const snippetsScope = ctx.get(["snippets"]);
    const snippets = isObject(snippetsScope) ? snippetsScope : {};
    const body = snippets[name];

    if (typeof body !== "string") {
      logger().warn(
        { snippetName: name },
        "Snippet referenced by a template was not found at render time; rendering it as empty",
      );
      return;
    }

    const stackScope: unknown = ctx.get(["snippet_stack"]);
    const stack: unknown[] = Array.isArray(stackScope) ? stackScope : [];
    if (stack.includes(name)) {
      throw new Error(`Snippet "${name}" includes itself`);
    }
    const maxDepth = config().snippetMaxDepth;
    if (stack.length >= maxDepth) {
      throw new Error(
        `Snippet "${name}" exceeds the maximum snippet depth of ${maxDepth}`,
      );
    }

    const params: unknown = yield hash.render(ctx);
    stack.push(name);
    ctx.push(isObject(params) ? params : {});
    try {
      yield this.liquid.renderer.renderTemplates(
        compileSnippet(this.liquid, body),
        ctx,
        emitter,
      );
    } finally {
      ctx.pop();
      stack.pop();
    }
  },
};
