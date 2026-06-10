import type { ThemePreference } from './types';

export type ResolvedTheme = 'dark' | 'light' | 'monokai';

export function resolveThemePreference(
  pref: ThemePreference,
  systemPrefersLight: boolean,
): ResolvedTheme {
  if (pref === 'dark' || pref === 'light' || pref === 'monokai') return pref;
  return systemPrefersLight ? 'light' : 'dark';
}

/** Lua module written beside init.lua; kept in sync with app terminal themes. */
export const NVIM_THEME_LUA_MODULE = `-- AI Worktrees theme module (auto-generated; do not edit)
local M = {}

local palettes = {
  dark = {
    bg = "#0f0f0f",
    fg = "#cccccc",
    muted = "#5a5a5a",
    line = "#1a1a1a",
    selection = "#264f78",
    keyword = "#569cd6",
    string = "#ce9178",
    number = "#b5cea8",
    comment = "#6a9955",
    function_name = "#dcdcaa",
    type_name = "#4ec9b0",
    error = "#f14c4c",
    accent = "#007acc",
  },
  light = {
    bg = "#ffffff",
    fg = "#333333",
    muted = "#6e6e6e",
    line = "#f3f3f3",
    selection = "#add6ff",
    keyword = "#0000ff",
    string = "#a31515",
    number = "#098658",
    comment = "#008000",
    function_name = "#795e26",
    type_name = "#267f99",
    error = "#c72e2e",
    accent = "#0066bf",
  },
  monokai = {
    bg = "#272822",
    fg = "#f8f8f2",
    muted = "#75715e",
    line = "#3e3d32",
    selection = "#49483e",
    keyword = "#f92672",
    string = "#e6db74",
    number = "#ae81ff",
    comment = "#75715e",
    function_name = "#a6e22e",
    type_name = "#66d9ef",
    error = "#f92672",
    accent = "#66d9ef",
  },
}

function M.apply(name)
  local palette = palettes[name] or palettes.dark
  vim.opt.background = name == "light" and "light" or "dark"
  vim.cmd("hi clear")
  if vim.fn.exists("syntax_on") then
    vim.cmd("syntax enable")
  end

  local hl = vim.api.nvim_set_hl
  hl(0, "Normal", { bg = palette.bg, fg = palette.fg })
  hl(0, "NormalNC", { bg = palette.bg, fg = palette.fg })
  hl(0, "Cursor", { bg = palette.accent, fg = palette.bg })
  hl(0, "CursorLine", { bg = palette.line })
  hl(0, "CursorLineNr", { fg = palette.fg, bold = true })
  hl(0, "LineNr", { fg = palette.muted })
  hl(0, "SignColumn", { bg = palette.bg })
  hl(0, "Folded", { bg = palette.line, fg = palette.muted })
  hl(0, "Visual", { bg = palette.selection })
  hl(0, "Search", { bg = palette.selection, fg = palette.fg })
  hl(0, "IncSearch", { bg = palette.accent, fg = palette.bg })
  hl(0, "StatusLine", { bg = palette.line, fg = palette.fg })
  hl(0, "StatusLineNC", { bg = palette.line, fg = palette.muted })
  hl(0, "WinSeparator", { fg = palette.line })
  hl(0, "Pmenu", { bg = palette.line, fg = palette.fg })
  hl(0, "PmenuSel", { bg = palette.selection, fg = palette.fg })
  hl(0, "FloatBorder", { fg = palette.muted })
  hl(0, "Comment", { fg = palette.comment, italic = true })
  hl(0, "Constant", { fg = palette.number })
  hl(0, "String", { fg = palette.string })
  hl(0, "Character", { fg = palette.string })
  hl(0, "Number", { fg = palette.number })
  hl(0, "Boolean", { fg = palette.number })
  hl(0, "Float", { fg = palette.number })
  hl(0, "Identifier", { fg = palette.fg })
  hl(0, "Function", { fg = palette.function_name })
  hl(0, "Keyword", { fg = palette.keyword })
  hl(0, "Operator", { fg = palette.fg })
  hl(0, "PreProc", { fg = palette.keyword })
  hl(0, "Type", { fg = palette.type_name })
  hl(0, "Special", { fg = palette.accent })
  hl(0, "Underlined", { fg = palette.accent, underline = true })
  hl(0, "Error", { fg = palette.error })
  hl(0, "DiagnosticError", { fg = palette.error })
  hl(0, "DiagnosticWarn", { fg = palette.string })
  hl(0, "DiagnosticInfo", { fg = palette.accent })
  hl(0, "DiagnosticHint", { fg = palette.type_name })
  hl(0, "@comment", { fg = palette.comment, italic = true })
  hl(0, "@string", { fg = palette.string })
  hl(0, "@number", { fg = palette.number })
  hl(0, "@keyword", { fg = palette.keyword })
  hl(0, "@function", { fg = palette.function_name })
  hl(0, "@type", { fg = palette.type_name })
  hl(0, "@variable", { fg = palette.fg })
  hl(0, "NERDTreeDir", { fg = palette.accent })
  hl(0, "NERDTreeFile", { fg = palette.fg })
  hl(0, "NERDTreeDirArrow", { fg = palette.muted })
  hl(0, "NERDTreeFlags", { fg = palette.muted })
  hl(0, "NERDTreeOpenable", { fg = palette.muted })
  hl(0, "NERDTreeClosable", { fg = palette.muted })
  hl(0, "NERDTreeCWD", { fg = palette.type_name })
  hl(0, "NERDTreeHelp", { fg = palette.comment })
  hl(0, "NERDTreeInvalid", { fg = palette.error })
end

_G.AIWorktreesTheme = vim.env.AI_WORKTREES_THEME or "dark"

_G.AIWorktreesApplyTheme = function(name)
  _G.AIWorktreesTheme = name
  M.apply(name)
end

return M
`;

export const NVIM_THEME_MODULE_FILENAME = 'ai-worktrees-theme.lua';
