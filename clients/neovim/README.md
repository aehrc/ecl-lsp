# ECL Language Server — Neovim

## Prerequisites

- Neovim 0.8+ (built-in LSP client)
- Node.js 18+

## Install the server

**Option A: npm (recommended)**

```bash
npm install -g ecl-lsp-server
```

**Option B: Build from source**

```bash
git clone <repo-url> && cd ecl-lsp
npm install && npm run compile
```

## Setup with nvim-lspconfig

The easiest approach uses [nvim-lspconfig](https://github.com/neovim/nvim-lspconfig). Add to your Neovim config (e.g. `~/.config/nvim/init.lua`):

```lua
-- Register .ecl file type
vim.filetype.add({
  extension = {
    ecl = 'ecl',
  },
})

-- Configure the ECL language server
local lspconfig = require('lspconfig')
local configs = require('lspconfig.configs')

if not configs.ecl then
  configs.ecl = {
    default_config = {
      -- If installed via npm:
      cmd = { 'ecl-lsp-server', '--stdio' },
      -- If built from source, use instead:
      -- cmd = { 'node', '/path/to/ecl-lsp/packages/ecl-lsp-server/dist/server.js', '--stdio' },
      filetypes = { 'ecl' },
      root_dir = function(fname)
        return lspconfig.util.find_git_ancestor(fname) or vim.fn.getcwd()
      end,
      settings = {},
    },
  }
end

lspconfig.ecl.setup({
  -- Optional: configure the terminology server
  settings = {
    ecl = {
      terminology = {
        -- serverUrl = 'https://tx.ontoserver.csiro.au/fhir',
        -- timeout = 2000,
        -- snomedVersion = 'http://snomed.info/sct/32506021000036107',
      },
      semanticValidation = {
        enabled = true,
      },
    },
  },
})
```

If built from source, uncomment the `node` line and replace `/path/to/ecl-lsp` with the actual path to your clone.

## Setup without nvim-lspconfig

If you prefer not to use nvim-lspconfig:

```lua
vim.filetype.add({ extension = { ecl = 'ecl' } })

vim.api.nvim_create_autocmd('FileType', {
  pattern = 'ecl',
  callback = function()
    vim.lsp.start({
      name = 'ecl-lsp',
      -- If installed via npm:
      cmd = { 'ecl-lsp-server', '--stdio' },
      -- If built from source, use instead:
      -- cmd = { 'node', '/path/to/ecl-lsp/packages/ecl-lsp-server/dist/server.js', '--stdio' },
    })
  end,
})
```

## Syntax highlighting

Neovim's built-in LSP client provides diagnostics, completion, hover, code actions, and formatting. For syntax highlighting, you can use the TextMate grammar with a tree-sitter-compatible plugin, or add basic highlighting via `after/syntax/ecl.vim`:

```vim
" ECL syntax highlighting (basic)
syn match eclOperator /\v\<\<[!]?|>>[!]?|\<[!]?|>[!]?|\^|!!\>|!!\</
syn match eclKeyword /\b\(AND\|OR\|MINUS\)\b/
syn match eclConceptId /\b\d\{6,18}\b/
syn region eclTerm start=/|/ end=/|/ contains=NONE
syn region eclComment start=/\/\*/ end=/\*\//
syn match eclLineComment /\/\/.*/

hi def link eclOperator Operator
hi def link eclKeyword Keyword
hi def link eclConceptId Number
hi def link eclTerm String
hi def link eclComment Comment
hi def link eclLineComment Comment
```

## Features

Once configured, the following features are available:

- **Diagnostics** — syntax errors, inactive/unknown concept warnings, semantic validation
- **Completion** — `<C-x><C-o>` or your completion plugin (operators, keywords, SNOMED CT concept search, filter values)
- **Hover** — `K` to show operator documentation or concept information
- **Code Actions** — refactoring actions (strip/add display terms, simplify, add parentheses, etc.)
- **Formatting** — `:lua vim.lsp.buf.format()` for document formatting
- **Code Lens** — expression evaluation (requires a plugin that supports code lenses, e.g. [nvim-lightbulb](https://github.com/kosayoda/nvim-lightbulb))

## Troubleshooting

Check the LSP log:

```vim
:lua vim.cmd('edit ' .. vim.lsp.get_log_path())
```
