'use strict';

// Local security backport for GHSA-vfj7-8cjw-p6xm. See ../PATCH.md.
const MAX_DEPTH = 100;
const MAX_AST_NODES = 20000;

const depthError = () => Object.assign(
  new SyntaxError(`Brace nesting exceeds the supported depth (${MAX_DEPTH})`),
  { code: 'ERR_BRACES_DEPTH' }
);

// Validate caller-supplied ASTs without recursion before recursive upstream walkers.
// Only child edges are traversed; normal parser parent/prev references are ignored.
const assertAst = ast => {
  const pending = [[ast, 0]];
  const visited = new WeakSet();
  let count = 1;
  while (pending.length) {
    const [node, depth] = pending.pop();
    if (!node || typeof node !== 'object') throw new TypeError('Expected an AST node');
    if (depth > MAX_DEPTH + 2) throw depthError();
    if (visited.has(node)) {
      throw Object.assign(new SyntaxError('Repeated or cyclic AST child node'), { code: 'ERR_BRACES_CYCLE' });
    }
    visited.add(node);
    if (node.nodes === undefined) continue;
    if (!Array.isArray(node.nodes)) throw new TypeError('Expected AST nodes to be an array');
    for (const child of node.nodes) {
      if (++count > MAX_AST_NODES) {
        throw Object.assign(new SyntaxError('AST node limit exceeded'), { code: 'ERR_BRACES_NODES' });
      }
      pending.push([child, depth + 1]);
    }
  }
};

module.exports = { MAX_DEPTH, MAX_AST_NODES, depthError, assertAst };
