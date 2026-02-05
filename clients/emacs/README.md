# ECL Language Server — Emacs

## Prerequisites

- Emacs 29+ (with built-in `eglot`) or Emacs 26+ with [lsp-mode](https://emacs-lsp.github.io/lsp-mode/)
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

## Setup with eglot (Emacs 29+, recommended)

Eglot is built into Emacs 29. Add to your `init.el`:

```elisp
;; Define ECL major mode
(define-derived-mode ecl-mode prog-mode "ECL"
  "Major mode for SNOMED CT Expression Constraint Language."
  (setq-local comment-start "/* ")
  (setq-local comment-end " */")
  (setq-local comment-start-skip "/\\*+\\s-*")

  ;; Basic syntax highlighting
  (setq font-lock-defaults
        '((("\\b\\(AND\\|OR\\|MINUS\\)\\b" . font-lock-keyword-face)
           ("\\(<<[!]?\\|>>[!]?\\|<[!]?\\|>[!]?\\|\\^\\|!!>\\|!!<\\)" . font-lock-builtin-face)
           ("\\b[0-9]\\{6,18\\}\\b" . font-lock-constant-face)
           ("|[^|]*|" . font-lock-string-face)
           ("/\\*[^*]*\\(?:\\*[^/][^*]*\\)*\\*/" . font-lock-comment-face)
           ("//.*$" . font-lock-comment-face)))))

;; Associate .ecl files with ecl-mode
(add-to-list 'auto-mode-alist '("\\.ecl\\'" . ecl-mode))

;; Register the ECL language server with eglot
(with-eval-after-load 'eglot
  (add-to-list 'eglot-server-programs
               ;; If installed via npm:
               '(ecl-mode . ("ecl-lsp-server" "--stdio"))))
               ;; If built from source, use instead:
               ;; '(ecl-mode . ("node" "/path/to/ecl-lsp/packages/ecl-lsp-server/dist/server.js" "--stdio"))))

;; Auto-start eglot for ECL files
(add-hook 'ecl-mode-hook #'eglot-ensure)
```

If built from source, uncomment the `node` line and replace `/path/to/ecl-lsp` with the actual path to your clone.

### Workspace settings

To configure the terminology server, use eglot workspace configuration:

```elisp
(setq-default eglot-workspace-configuration
              '(:ecl (:terminology (:serverUrl "https://tx.ontoserver.csiro.au/fhir"
                                    :timeout 2000)
                      :semanticValidation (:enabled t))))
```

## Setup with lsp-mode (Emacs 26+)

If you prefer lsp-mode, add to your `init.el`:

```elisp
;; Define ECL major mode (same as above)
(define-derived-mode ecl-mode prog-mode "ECL"
  "Major mode for SNOMED CT Expression Constraint Language."
  (setq-local comment-start "/* ")
  (setq-local comment-end " */")
  (setq-local comment-start-skip "/\\*+\\s-*")
  (setq font-lock-defaults
        '((("\\b\\(AND\\|OR\\|MINUS\\)\\b" . font-lock-keyword-face)
           ("\\(<<[!]?\\|>>[!]?\\|<[!]?\\|>[!]?\\|\\^\\|!!>\\|!!<\\)" . font-lock-builtin-face)
           ("\\b[0-9]\\{6,18\\}\\b" . font-lock-constant-face)
           ("|[^|]*|" . font-lock-string-face)
           ("/\\*[^*]*\\(?:\\*[^/][^*]*\\)*\\*/" . font-lock-comment-face)
           ("//.*$" . font-lock-comment-face)))))

(add-to-list 'auto-mode-alist '("\\.ecl\\'" . ecl-mode))

;; Register with lsp-mode
(with-eval-after-load 'lsp-mode
  (lsp-register-client
   (make-lsp-client
    :new-connection (lsp-stdio-connection
                     ;; If installed via npm:
                     '("ecl-lsp-server" "--stdio"))
                     ;; If built from source, use instead:
                     ;; '("node" "/path/to/ecl-lsp/packages/ecl-lsp-server/dist/server.js" "--stdio"))
    :activation-fn (lsp-activate-on "ecl")
    :server-id 'ecl-lsp
    :priority -1
    :initialized-fn (lambda (workspace)
                      (with-lsp-workspace workspace
                        (lsp--set-configuration
                         (lsp-configuration-section "ecl")))))))

(add-hook 'ecl-mode-hook #'lsp)
```

### lsp-mode settings

```elisp
(setq lsp-ecl-terminology-server-url "https://tx.ontoserver.csiro.au/fhir"
      lsp-ecl-terminology-timeout 2000)
```

## Features

Once configured, the following features are available:

| Feature      | eglot                            | lsp-mode                                      |
| ------------ | -------------------------------- | --------------------------------------------- |
| Diagnostics  | `flymake` (built-in)             | `flycheck` or `flymake`                       |
| Completion   | `completion-at-point` (`C-M-i`)  | `company-mode` or `completion-at-point`       |
| Hover        | `eldoc` (automatic)              | `lsp-ui-doc` or `lsp-describe-thing-at-point` |
| Code Actions | `eglot-code-actions` (`C-c C-a`) | `lsp-execute-code-action` (`s-l a a`)         |
| Formatting   | `eglot-format` (`C-c C-f`)       | `lsp-format-buffer` (`s-l = =`)               |

## Troubleshooting

### eglot

View the server events buffer:

```
M-x eglot-events-buffer
```

### lsp-mode

Toggle the log:

```
M-x lsp-workspace-show-log
```
