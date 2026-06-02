import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import * as ts from "typescript";

const ignoredDirectoryNames = new Set([
  ".git",
  ".atlas",
  "node_modules",
  "dist",
  "coverage",
  ".next",
  "build"
]);

const textExtensions = new Set([
  ".js",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
  ".jsx",
  ".json",
  ".md",
  ".py",
  ".go",
  ".rs",
  ".java",
  ".yml",
  ".yaml",
  ".toml",
  ".sh"
]);

const IGNORED_CALLS = new Set([
  "if",
  "for",
  "while",
  "switch",
  "catch",
  "return",
  "typeof",
  "import",
  "function",
  "class",
  "console",
  "String",
  "Number",
  "Boolean",
  "Object",
  "Array",
  "JSON",
  "Date",
  "Map",
  "Set",
  "Promise",
  "Error",
  "parseInt",
  "parseFloat",
  "resolve",
  "join",
  "push",
  "slice",
  "filter",
  "map",
  "reduce",
  "find",
  "includes",
  "trim",
  "split",
  "replace",
  "entries",
  "values",
  "keys",
  "write",
  "log",
  "stringify",
  "max",
  "min",
  "has",
  "get",
  "set",
  "test"
]);

export async function scanRepository(rootDir) {
  const files = [];
  await walk(rootDir, rootDir, files);
  resolveGraph(files);
  const testEdges = buildTestEdges(files);
  const fileMap = new Map(files.map((file) => [file.path, file]));
  for (const edge of testEdges) {
    const sourceFile = fileMap.get(edge.sourcePath);
    if (sourceFile) {
      sourceFile.relationships.push(edge);
    }
  }
  return {
    files,
    ignoredDirectories: Array.from(ignoredDirectoryNames)
  };
}

async function walk(rootDir, currentDir, files) {
  const entries = await fs.readdir(currentDir, { withFileTypes: true });
  for (const entry of entries) {
    const absolutePath = path.join(currentDir, entry.name);
    const relativePath = path.relative(rootDir, absolutePath);
    if (entry.isDirectory()) {
      if (ignoredDirectoryNames.has(entry.name)) {
        continue;
      }
      await walk(rootDir, absolutePath, files);
      continue;
    }

    const extension = path.extname(entry.name).toLowerCase();
    if (!textExtensions.has(extension)) {
      continue;
    }

    const content = await fs.readFile(absolutePath, "utf8");
    const normalized = content.slice(0, 12000);
    const structured = isJavaScriptFamily(extension)
      ? analyzeJavaScriptLikeSource(relativePath, normalized, extension)
      : null;
    files.push({
      path: relativePath,
      absolutePath,
      language: detectLanguage(extension),
      sizeBytes: Buffer.byteLength(content),
      hash: crypto.createHash("sha1").update(content).digest("hex"),
      summary: summarizeFile(relativePath, normalized),
      symbols: structured?.symbols || extractSymbols(relativePath, normalized),
      imports: structured?.imports || extractImports(relativePath, normalized),
      calls: structured?.calls || extractCalls(relativePath, normalized),
      receiverBindings: structured?.receiverBindings || {},
      relationships: []
    });
  }
}

function detectLanguage(extension) {
  const mapping = {
    ".js": "javascript",
    ".mjs": "javascript",
    ".cjs": "javascript",
    ".ts": "typescript",
    ".tsx": "typescript",
    ".jsx": "javascript",
    ".json": "json",
    ".md": "markdown",
    ".py": "python",
    ".go": "go",
    ".rs": "rust",
    ".java": "java",
    ".yml": "yaml",
    ".yaml": "yaml",
    ".toml": "toml",
    ".sh": "shell"
  };
  return mapping[extension] || "text";
}

function isJavaScriptFamily(extension) {
  return [".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx"].includes(extension);
}

function summarizeFile(relativePath, content) {
  const lines = content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 5);

  if (lines.length === 0) {
    return `File ${relativePath} is indexed but currently empty.`;
  }

  return `File ${relativePath} starts with: ${lines.join(" ").slice(0, 280)}`;
}

function analyzeJavaScriptLikeSource(relativePath, content, extension) {
  try {
    const parsed = analyzeJavaScriptLikeSourceAst(relativePath, content, extension);
    if (parsed.symbols.length > 0 || parsed.imports.length > 0 || parsed.calls.length > 0) {
      return parsed;
    }
  } catch {
    // Fall back to the heuristic scanner if AST parsing fails unexpectedly.
  }

  const fallback = analyzeJavaScriptLikeSourceHeuristic(relativePath, content);
  return {
    ...fallback,
    receiverBindings: {}
  };
}

function analyzeJavaScriptLikeSourceAst(relativePath, content, extension) {
  const sourceFile = ts.createSourceFile(
    relativePath,
    content,
    ts.ScriptTarget.Latest,
    true,
    scriptKindForExtension(extension)
  );

  const symbols = [];
  const imports = [];
  const calls = [];
  const receiverBindings = {};
  const localSymbolNames = new Set();

  const addSymbol = (name, kind) => {
    if (!name) {
      return;
    }
    symbols.push({ name, kind, filePath: relativePath });
    localSymbolNames.add(name);
  };

  const collectBindingFromTypeNode = (bindingName, typeNode) => {
    const inferredName = inferBindingSymbolName(typeNode);
    if (bindingName && inferredName) {
      receiverBindings[bindingName] = inferredName;
    }
  };

  const collectTopLevelDeclaration = (statement) => {
    if (ts.isFunctionDeclaration(statement) && statement.name) {
      addSymbol(statement.name.text, "function");
      return;
    }

    if (ts.isClassDeclaration(statement) && statement.name) {
      addSymbol(statement.name.text, "class");

      for (const member of statement.members) {
        if (ts.isMethodDeclaration(member) && ts.isIdentifier(member.name)) {
          addSymbol(member.name.text, "method");
        }
        if (ts.isPropertyDeclaration(member) && ts.isIdentifier(member.name)) {
          collectBindingFromTypeNode(member.name.text, member.type);
          const initializerName = inferBindingSymbolName(member.initializer);
          if (initializerName) {
            receiverBindings[member.name.text] = initializerName;
          }
        }
        if (ts.isConstructorDeclaration(member)) {
          for (const parameter of member.parameters) {
            if (
              ts.isIdentifier(parameter.name) &&
              parameter.modifiers?.some((modifier) =>
                modifier.kind === ts.SyntaxKind.PrivateKeyword
                || modifier.kind === ts.SyntaxKind.PublicKeyword
                || modifier.kind === ts.SyntaxKind.ProtectedKeyword
                || modifier.kind === ts.SyntaxKind.ReadonlyKeyword
              )
            ) {
              collectBindingFromTypeNode(parameter.name.text, parameter.type);
              const initializerName = inferBindingSymbolName(parameter.initializer);
              if (initializerName) {
                receiverBindings[parameter.name.text] = initializerName;
              }
            }
          }
        }
      }
      return;
    }

    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name)) {
          continue;
        }
        const variableKind = inferVariableSymbolKind(declaration.initializer);
        if (variableKind) {
          addSymbol(declaration.name.text, variableKind);
        }
        collectBindingFromTypeNode(declaration.name.text, declaration.type);
        const initializerName = inferBindingSymbolName(declaration.initializer);
        if (initializerName) {
          receiverBindings[declaration.name.text] = initializerName;
        }
      }
    }
  };

  for (const statement of sourceFile.statements) {
    collectTopLevelDeclaration(statement);

    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      const specifier = statement.moduleSpecifier.text;
      imports.push({
        sourcePath: relativePath,
        specifier,
        targetPath: "",
        edgeType: specifier.startsWith(".") ? "import" : "external_import",
        importedSymbols: extractImportedSymbolsFromClause(statement.importClause)
      });
      continue;
    }

    if (
      ts.isExpressionStatement(statement)
      && ts.isCallExpression(statement.expression)
      && statement.expression.expression.kind === ts.SyntaxKind.ImportKeyword
    ) {
      const [firstArg] = statement.expression.arguments;
      if (firstArg && ts.isStringLiteralLike(firstArg)) {
        imports.push({
          sourcePath: relativePath,
          specifier: firstArg.text,
          targetPath: "",
          edgeType: firstArg.text.startsWith(".") ? "import" : "external_import",
          importedSymbols: []
        });
      }
    }
  }

  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      const call = extractCallEntry(relativePath, node, localSymbolNames);
      if (call) {
        calls.push(call);
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  return {
    symbols: dedupeSymbols(symbols),
    imports: dedupeImports(imports),
    calls: dedupeImports(calls),
    receiverBindings
  };
}

function analyzeJavaScriptLikeSourceHeuristic(relativePath, content) {
  const tokens = tokenizeJavaScriptLike(content);
  const symbols = [];
  const imports = [];
  const calls = [];
  const localSymbolNames = new Set();
  let braceDepth = 0;
  let parenDepth = 0;
  let bracketDepth = 0;

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.type === "punct") {
      if (token.value === "{") {
        braceDepth += 1;
      } else if (token.value === "}") {
        braceDepth = Math.max(0, braceDepth - 1);
      } else if (token.value === "(") {
        parenDepth += 1;
      } else if (token.value === ")") {
        parenDepth = Math.max(0, parenDepth - 1);
      } else if (token.value === "[") {
        bracketDepth += 1;
      } else if (token.value === "]") {
        bracketDepth = Math.max(0, bracketDepth - 1);
      }
    }

    const topLevel = braceDepth === 0 && parenDepth === 0 && bracketDepth === 0;
    if (topLevel && token.type === "identifier") {
      if (token.value === "import") {
        const parsed = consumeImportTokens(relativePath, tokens, index);
        if (parsed.entries.length > 0) {
          imports.push(...parsed.entries);
          index = parsed.endIndex;
          continue;
        }
      }

      if (token.value === "export") {
        const exportSymbol = consumeExportSymbol(relativePath, tokens, index);
        if (exportSymbol) {
          symbols.push(exportSymbol.symbol);
          localSymbolNames.add(exportSymbol.symbol.name);
          index = exportSymbol.endIndex;
          continue;
        }
      }

      const declaration = consumeTopLevelSymbol(relativePath, tokens, index);
      if (declaration) {
        symbols.push(declaration.symbol);
        localSymbolNames.add(declaration.symbol.name);
        index = declaration.endIndex;
        continue;
      }
    }

    const call = consumeCallToken(relativePath, tokens, index, localSymbolNames);
    if (call) {
      calls.push(call);
    }
  }

  return {
    symbols: dedupeSymbols(symbols),
    imports: dedupeImports(imports),
    calls: dedupeImports(calls)
  };
}

function scriptKindForExtension(extension) {
  switch (extension) {
    case ".ts":
      return ts.ScriptKind.TS;
    case ".tsx":
      return ts.ScriptKind.TSX;
    case ".jsx":
      return ts.ScriptKind.JSX;
    default:
      return ts.ScriptKind.JS;
  }
}

function inferVariableSymbolKind(initializer) {
  if (!initializer) {
    return null;
  }
  if (ts.isClassExpression(initializer)) {
    return "class";
  }
  if (
    ts.isFunctionExpression(initializer)
    || ts.isArrowFunction(initializer)
    || ts.isMethodDeclaration(initializer)
  ) {
    return "function";
  }
  return null;
}

function extractImportedSymbolsFromClause(importClause) {
  if (!importClause) {
    return [];
  }

  const importedSymbols = [];
  if (importClause.name) {
    importedSymbols.push({ importedName: "default", localName: importClause.name.text });
  }

  const namedBindings = importClause.namedBindings;
  if (!namedBindings) {
    return importedSymbols;
  }

  if (ts.isNamespaceImport(namedBindings)) {
    importedSymbols.push({ importedName: "*", localName: namedBindings.name.text });
    return importedSymbols;
  }

  for (const element of namedBindings.elements) {
    importedSymbols.push({
      importedName: element.propertyName?.text || element.name.text,
      localName: element.name.text
    });
  }

  return importedSymbols;
}

function inferBindingSymbolName(node) {
  if (!node) {
    return "";
  }

  if (ts.isTypeReferenceNode(node)) {
    if (ts.isIdentifier(node.typeName)) {
      return node.typeName.text;
    }
    if (ts.isQualifiedName(node.typeName)) {
      return node.typeName.right.text;
    }
  }

  if (ts.isIdentifier(node)) {
    return node.text;
  }

  if (ts.isNewExpression(node) && ts.isIdentifier(node.expression)) {
    return node.expression.text;
  }

  if (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) {
    return inferBindingSymbolName(node.expression);
  }

  if (ts.isParenthesizedExpression(node)) {
    return inferBindingSymbolName(node.expression);
  }

  return "";
}

function extractCallEntry(relativePath, node, localSymbolNames) {
  if (ts.isIdentifier(node.expression)) {
    const name = node.expression.text;
    if (IGNORED_CALLS.has(name) || localSymbolNames.has(name)) {
      return null;
    }

    return {
      sourcePath: relativePath,
      specifier: name,
      targetPath: "",
      edgeType: "call",
      receiver: ""
    };
  }

  if (ts.isPropertyAccessExpression(node.expression)) {
    const specifier = node.expression.name.text;
    if (IGNORED_CALLS.has(specifier)) {
      return null;
    }

    return {
      sourcePath: relativePath,
      specifier,
      targetPath: "",
      edgeType: "call",
      receiver: extractCallReceiver(node.expression.expression)
    };
  }

  return null;
}

function extractCallReceiver(expression) {
  if (ts.isIdentifier(expression)) {
    return expression.text;
  }

  if (
    ts.isPropertyAccessExpression(expression)
    && expression.expression.kind === ts.SyntaxKind.ThisKeyword
    && ts.isIdentifier(expression.name)
  ) {
    return expression.name.text;
  }

  if (ts.isPropertyAccessExpression(expression)) {
    return extractCallReceiver(expression.expression);
  }

  return "";
}

function tokenizeJavaScriptLike(content) {
  const tokens = [];
  let index = 0;

  while (index < content.length) {
    const char = content[index];
    const next = content[index + 1];

    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    if (char === "/" && next === "/") {
      index += 2;
      while (index < content.length && content[index] !== "\n") {
        index += 1;
      }
      continue;
    }

    if (char === "/" && next === "*") {
      index += 2;
      while (index < content.length && !(content[index] === "*" && content[index + 1] === "/")) {
        index += 1;
      }
      index += 2;
      continue;
    }

    if (char === "'" || char === "\"" || char === "`") {
      const { value, nextIndex } = readQuotedString(content, index, char);
      tokens.push({ type: "string", value });
      index = nextIndex;
      continue;
    }

    if (/[A-Za-z_$]/.test(char)) {
      let end = index + 1;
      while (end < content.length && /[A-Za-z0-9_$]/.test(content[end])) {
        end += 1;
      }
      tokens.push({ type: "identifier", value: content.slice(index, end) });
      index = end;
      continue;
    }

    if (/[0-9]/.test(char)) {
      let end = index + 1;
      while (end < content.length && /[0-9._]/.test(content[end])) {
        end += 1;
      }
      tokens.push({ type: "number", value: content.slice(index, end) });
      index = end;
      continue;
    }

    if (char === "=" && next === ">") {
      tokens.push({ type: "punct", value: "=>" });
      index += 2;
      continue;
    }

    if (char === "." && next === "." && content[index + 2] === ".") {
      tokens.push({ type: "punct", value: "..." });
      index += 3;
      continue;
    }

    tokens.push({ type: "punct", value: char });
    index += 1;
  }

  return tokens;
}

function readQuotedString(content, startIndex, quoteChar) {
  let index = startIndex + 1;
  let value = "";

  while (index < content.length) {
    const char = content[index];
    if (char === "\\") {
      value += content[index + 1] || "";
      index += 2;
      continue;
    }

    if (quoteChar === "`" && char === "$" && content[index + 1] === "{") {
      index += 2;
      let depth = 1;
      while (index < content.length && depth > 0) {
        if (content[index] === "{") {
          depth += 1;
        } else if (content[index] === "}") {
          depth -= 1;
        }
        index += 1;
      }
      continue;
    }

    if (char === quoteChar) {
      return {
        value,
        nextIndex: index + 1
      };
    }

    value += char;
    index += 1;
  }

  return {
    value,
    nextIndex: content.length
  };
}

function consumeImportTokens(relativePath, tokens, startIndex) {
  const nextToken = tokens[startIndex + 1];
  if (nextToken?.type === "punct" && nextToken.value === "(") {
    const stringToken = tokens[startIndex + 2];
    if (stringToken?.type === "string") {
      return {
        entries: [{
          sourcePath: relativePath,
          specifier: stringToken.value,
          targetPath: "",
          edgeType: stringToken.value.startsWith(".") ? "import" : "external_import",
          importedSymbols: []
        }],
        endIndex: Math.min(tokens.length - 1, startIndex + 3)
      };
    }
  }

  const entries = [];
  let cursor = startIndex + 1;
  const clauseTokens = [];

  while (cursor < tokens.length) {
    const token = tokens[cursor];
    if (token.type === "identifier" && token.value === "from") {
      const specifierToken = tokens[cursor + 1];
      if (specifierToken?.type === "string") {
        entries.push({
          sourcePath: relativePath,
          specifier: specifierToken.value,
          targetPath: "",
          edgeType: specifierToken.value.startsWith(".") ? "import" : "external_import",
          importedSymbols: parseImportedSymbolsFromTokens(clauseTokens)
        });
        return { entries, endIndex: cursor + 1 };
      }
      break;
    }

    if (token.type === "string") {
      entries.push({
        sourcePath: relativePath,
        specifier: token.value,
        targetPath: "",
        edgeType: token.value.startsWith(".") ? "import" : "external_import",
        importedSymbols: []
      });
      return { entries, endIndex: cursor };
    }

    if (token.type === "punct" && token.value === ";") {
      break;
    }

    clauseTokens.push(token);
    cursor += 1;
  }

  return { entries: [], endIndex: startIndex };
}

function consumeExportSymbol(relativePath, tokens, startIndex) {
  const nextToken = tokens[startIndex + 1];
  if (!nextToken || nextToken.type !== "identifier") {
    return null;
  }

  if (nextToken.value === "default") {
    const afterDefault = tokens[startIndex + 2];
    if (afterDefault?.type === "identifier" && (afterDefault.value === "function" || afterDefault.value === "class")) {
      const nameToken = tokens[startIndex + 3];
      if (nameToken?.type === "identifier") {
        return {
          symbol: {
            name: nameToken.value,
            kind: afterDefault.value === "class" ? "class" : "function",
            filePath: relativePath
          },
          endIndex: startIndex + 3
        };
      }
    }
    return null;
  }

  return consumeTopLevelSymbol(relativePath, tokens, startIndex + 1);
}

function consumeTopLevelSymbol(relativePath, tokens, startIndex) {
  const token = tokens[startIndex];
  if (!token || token.type !== "identifier") {
    return null;
  }

  if (token.value === "async" && tokens[startIndex + 1]?.value === "function") {
    const nameToken = tokens[startIndex + 2];
    if (nameToken?.type === "identifier") {
      return {
        symbol: { name: nameToken.value, kind: "function", filePath: relativePath },
        endIndex: startIndex + 2
      };
    }
  }

  if (token.value === "function") {
    const nameToken = tokens[startIndex + 1];
    if (nameToken?.type === "identifier") {
      return {
        symbol: { name: nameToken.value, kind: "function", filePath: relativePath },
        endIndex: startIndex + 1
      };
    }
  }

  if (token.value === "class") {
    const nameToken = tokens[startIndex + 1];
    if (nameToken?.type === "identifier") {
      return {
        symbol: { name: nameToken.value, kind: "class", filePath: relativePath },
        endIndex: startIndex + 1
      };
    }
  }

  if (["const", "let", "var"].includes(token.value)) {
    const nameToken = tokens[startIndex + 1];
    const equalsToken = tokens[startIndex + 2];
    if (nameToken?.type !== "identifier" || equalsToken?.value !== "=") {
      return null;
    }

    const rhs = tokens.slice(startIndex + 3, startIndex + 8).map((entry) => entry.value);
    const kind = rhs.includes("class")
      ? "class"
      : (rhs.includes("function") || rhs.includes("=>"))
        ? "function"
        : null;

    if (!kind) {
      return null;
    }

    return {
      symbol: { name: nameToken.value, kind, filePath: relativePath },
      endIndex: startIndex + 2
    };
  }

  return null;
}

function consumeCallToken(relativePath, tokens, index, localSymbolNames) {
  const token = tokens[index];
  if (!token || token.type !== "identifier") {
    return null;
  }

  if (IGNORED_CALLS.has(token.value) || localSymbolNames.has(token.value)) {
    return null;
  }

  const nextToken = tokens[index + 1];
  if (nextToken?.type === "punct" && nextToken.value === "(") {
    const previousToken = tokens[index - 1];
    if (previousToken?.value === "." || previousToken?.value === "function" || previousToken?.value === "class") {
      return null;
    }

    return {
      sourcePath: relativePath,
      specifier: token.value,
      targetPath: "",
      edgeType: "call",
      receiver: ""
    };
  }

  if (
    nextToken?.type === "punct" &&
    nextToken.value === "." &&
    tokens[index + 2]?.type === "identifier" &&
    tokens[index + 3]?.type === "punct" &&
    tokens[index + 3].value === "("
  ) {
    const receiver = token.value;
    const callee = tokens[index + 2].value;
    if (IGNORED_CALLS.has(callee)) {
      return null;
    }

    return {
      sourcePath: relativePath,
      specifier: callee,
      targetPath: "",
      edgeType: "call",
      receiver
    };
  }

  return null;
}

function extractSymbols(relativePath, content) {
  const symbols = [];
  const patterns = [
    /\b(?:export\s+)?function\s+([A-Za-z0-9_]+)/g,
    /\b(?:export\s+)?class\s+([A-Za-z0-9_]+)/g,
    /\bconst\s+([A-Za-z0-9_]+)\s*=\s*(?:async\s*)?\(/g,
    /\bconst\s+([A-Za-z0-9_]+)\s*=\s*(?:async\s*)?[^=\n]*=>/g,
    /\b(?:export\s+)?async\s+function\s+([A-Za-z0-9_]+)/g,
    /\bdef\s+([A-Za-z0-9_]+)/g
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      symbols.push({
        name: match[1],
        kind: inferSymbolKind(match[0]),
        filePath: relativePath
      });
    }
  }

  return dedupeSymbols(symbols);
}

function inferSymbolKind(source) {
  if (source.includes("class")) {
    return "class";
  }
  return "function";
}

function dedupeSymbols(symbols) {
  const seen = new Set();
  return symbols.filter((symbol) => {
    const key = `${symbol.filePath}:${symbol.kind}:${symbol.name}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function extractImports(relativePath, content) {
  const imports = [];
  const importFromPattern = /\bimport\s+([\s\S]*?)\s+from\s+["']([^"']+)["']/g;
  const dynamicImportPattern = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;
  const requirePattern = /\b(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*require\s*\(\s*["']([^"']+)["']\s*\)/g;

  let match;
  while ((match = importFromPattern.exec(content)) !== null) {
    const importedClause = match[1];
    const specifier = match[2];
    imports.push({
      sourcePath: relativePath,
      specifier,
      targetPath: "",
      edgeType: specifier.startsWith(".") ? "import" : "external_import",
      importedSymbols: parseImportedSymbols(importedClause)
    });
  }

  while ((match = dynamicImportPattern.exec(content)) !== null) {
    const specifier = match[1];
    imports.push({
      sourcePath: relativePath,
      specifier,
      targetPath: "",
      edgeType: specifier.startsWith(".") ? "import" : "external_import",
      importedSymbols: []
    });
  }

  while ((match = requirePattern.exec(content)) !== null) {
    const localName = match[1];
    const specifier = match[2];
    imports.push({
      sourcePath: relativePath,
      specifier,
      targetPath: "",
      edgeType: specifier.startsWith(".") ? "import" : "external_import",
      importedSymbols: [{ importedName: "default", localName }]
    });
  }

  return dedupeImports(imports);
}

function dedupeImports(imports) {
  const seen = new Set();
  return imports.filter((entry) => {
    const key = `${entry.sourcePath}:${entry.edgeType}:${entry.specifier}:${entry.targetPath || ""}:${JSON.stringify(entry.importedSymbols || [])}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function extractCalls(relativePath, content) {
  const calls = [];
  const symbols = extractSymbols(relativePath, content);
  const localSymbolNames = new Set(symbols.map((symbol) => symbol.name));
  const patterns = [
    /\b([A-Za-z_][A-Za-z0-9_]*)\s*\(/g,
    /\b([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)\s*\(/g
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const symbolName = match[2] || match[1];
      if (IGNORED_CALLS.has(symbolName) || localSymbolNames.has(symbolName)) {
        continue;
      }
      calls.push({
        sourcePath: relativePath,
        specifier: symbolName,
        targetPath: "",
        edgeType: "call",
        receiver: match[2] ? match[1] : ""
      });
    }
  }

  return dedupeImports(calls);
}

function buildTestEdges(files) {
  const edges = [];
  const codeFiles = files.filter((file) => !isTestFile(file.path));
  const testFiles = files.filter((file) => isTestFile(file.path));

  for (const testFile of testFiles) {
    for (const codeFile of codeFiles) {
      if (isLikelyTestFor(testFile, codeFile)) {
        edges.push({
          sourcePath: testFile.path,
          specifier: codeFile.path,
          targetPath: codeFile.path,
          edgeType: "tests"
        });
        edges.push({
          sourcePath: codeFile.path,
          specifier: testFile.path,
          targetPath: testFile.path,
          edgeType: "tested_by"
        });
      }
    }
  }

  return dedupeImports(edges);
}

function resolveGraph(files) {
  const existingPaths = new Set(files.map((file) => normalizePath(file.path)));
  const symbolIndex = buildSymbolIndex(files);

  for (const file of files) {
    file.imports = file.imports.map((entry) => resolveImportEntry(file.path, entry, existingPaths));
  }

  for (const file of files) {
    file.calls = file.calls.map((entry) => resolveCallEntry(file, entry, symbolIndex));
  }
}

function buildSymbolIndex(files) {
  const index = new Map();
  for (const file of files) {
    for (const symbol of file.symbols) {
      const key = symbol.name.toLowerCase();
      const owners = index.get(key) || [];
      owners.push({
        filePath: file.path,
        kind: symbol.kind,
        symbolName: symbol.name
      });
      index.set(key, owners);
    }
  }
  return index;
}

function resolveImportEntry(sourcePath, entry, existingPaths) {
  if (!entry.specifier.startsWith(".")) {
    return {
      ...entry,
      targetPath: "",
      edgeType: "external_import"
    };
  }

  const normalizedSource = normalizePath(sourcePath);
  const sourceDirectory = path.posix.dirname(normalizedSource);
  const normalizedBase = path.posix.normalize(path.posix.join(sourceDirectory, entry.specifier));
  const candidates = [
    normalizedBase,
    `${normalizedBase}.js`,
    `${normalizedBase}.mjs`,
    `${normalizedBase}.cjs`,
    `${normalizedBase}.ts`,
    `${normalizedBase}.tsx`,
    `${normalizedBase}.jsx`,
    `${normalizedBase}.json`,
    path.posix.join(normalizedBase, "index.js"),
    path.posix.join(normalizedBase, "index.ts"),
    path.posix.join(normalizedBase, "index.tsx"),
    path.posix.join(normalizedBase, "index.jsx")
  ];

  const resolvedTarget = candidates.find((candidate) => existingPaths.has(candidate)) || "";

  return {
    ...entry,
    targetPath: resolvedTarget,
    edgeType: resolvedTarget ? "import" : "external_import"
  };
}

function resolveCallEntry(file, entry, symbolIndex) {
  const importMatch = file.imports.find((importEntry) =>
    importEntry.importedSymbols?.some((symbol) => symbol.localName === entry.specifier)
  );

  if (importMatch?.targetPath) {
    const symbolBinding = importMatch.importedSymbols.find((symbol) => symbol.localName === entry.specifier);
    return {
      ...entry,
      specifier: symbolBinding?.importedName || entry.specifier,
      targetPath: importMatch.targetPath
    };
  }

  if (entry.receiver) {
    const receiverBinding = file.receiverBindings?.[entry.receiver];
    if (receiverBinding) {
      const boundImport = file.imports.find((importEntry) =>
        importEntry.importedSymbols?.some((symbol) => symbol.localName === receiverBinding || symbol.importedName === receiverBinding)
      );
      if (boundImport?.targetPath) {
        return {
          ...entry,
          targetPath: boundImport.targetPath
        };
      }

      const receiverOwners = symbolIndex.get(receiverBinding.toLowerCase()) || [];
      const externalReceiverOwner = receiverOwners.find((owner) => owner.filePath !== file.path);
      if (externalReceiverOwner) {
        return {
          ...entry,
          targetPath: externalReceiverOwner.filePath
        };
      }
    }

    const receiverImport = file.imports.find((importEntry) =>
      importEntry.importedSymbols?.some((symbol) => symbol.localName === entry.receiver)
    );
    if (receiverImport?.targetPath) {
      return {
        ...entry,
        targetPath: receiverImport.targetPath
      };
    }
  }

  const owners = symbolIndex.get(entry.specifier.toLowerCase()) || [];
  const externalOwner = owners.find((owner) => owner.filePath !== file.path);
  if (externalOwner) {
    return {
      ...entry,
      targetPath: externalOwner.filePath
    };
  }

  return entry;
}

function parseImportedSymbols(importedClause) {
  const clause = importedClause.trim();
  if (!clause) {
    return [];
  }

  const importedSymbols = [];
  const cleaned = clause.replace(/\s+/g, " ").trim();

  const namespaceMatch = cleaned.match(/^\*\s+as\s+([A-Za-z_$][A-Za-z0-9_$]*)$/);
  if (namespaceMatch) {
    importedSymbols.push({ importedName: "*", localName: namespaceMatch[1] });
    return importedSymbols;
  }

  const parts = splitTopLevelComma(cleaned);
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) {
      continue;
    }

    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      const inner = trimmed.slice(1, -1).trim();
      for (const namePart of inner.split(",").map((entry) => entry.trim()).filter(Boolean)) {
        const aliasMatch = namePart.match(/^([A-Za-z_$][A-Za-z0-9_$]*)(?:\s+as\s+([A-Za-z_$][A-Za-z0-9_$]*))?$/);
        if (aliasMatch) {
          importedSymbols.push({
            importedName: aliasMatch[1],
            localName: aliasMatch[2] || aliasMatch[1]
          });
        }
      }
      continue;
    }

    const defaultMatch = trimmed.match(/^([A-Za-z_$][A-Za-z0-9_$]*)$/);
    if (defaultMatch) {
      importedSymbols.push({ importedName: "default", localName: defaultMatch[1] });
    }
  }

  return importedSymbols;
}

function parseImportedSymbolsFromTokens(tokens) {
  const clause = joinTokens(tokens).trim();
  return parseImportedSymbols(clause);
}

function splitTopLevelComma(value) {
  const parts = [];
  let depth = 0;
  let current = "";

  for (const char of value) {
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth = Math.max(0, depth - 1);
    }

    if (char === "," && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  if (current) {
    parts.push(current);
  }

  return parts;
}

function joinTokens(tokens) {
  return tokens
    .map((token) => token.type === "string" ? `"${token.value}"` : token.value)
    .join(" ")
    .replace(/\s+([{}(),.:;])/g, "$1")
    .replace(/([{}(),.:;])\s+/g, "$1 ")
    .trim();
}

function isTestFile(filePath) {
  return /(^|\/)(test|tests|__tests__)\/|(\.|-)(test|spec)\.[^.]+$/i.test(filePath);
}

function isLikelyTestFor(testFile, codeFile) {
  const testBase = normalizeStem(testFile.path);
  const codeBase = normalizeStem(codeFile.path);
  if (testBase === codeBase) {
    return true;
  }

  return testFile.imports.some((entry) => entry.targetPath === codeFile.path);
}

function normalizeStem(filePath) {
  return filePath
    .replace(/\\/g, "/")
    .replace(/(^|\/)(test|tests|__tests__)\//gi, "/")
    .replace(/(\.|-)(test|spec)\.[^.]+$/i, "")
    .replace(/\.[^.]+$/, "");
}

function normalizePath(filePath) {
  return filePath.replace(/\\/g, "/");
}
