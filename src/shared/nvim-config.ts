export const NVIM_CONFIG_VERSION = 6;

export const DEFAULT_NVIM_CONFIG = `-- AI Worktrees editor config (isolated from your personal Neovim setup)
-- version: ${NVIM_CONFIG_VERSION}
vim.g.mapleader = " "

-- Avoid netrw (directory buffer) alongside NERDTree
vim.g.loaded_netrw = 1
vim.g.loaded_netrwPlugin = 1

vim.opt.number = true
vim.opt.relativenumber = true
vim.opt.signcolumn = "yes"
vim.opt.wrap = false
vim.opt.splitbelow = true
vim.opt.splitright = true
vim.opt.termguicolors = true
vim.opt.mouse = "a"

local function load_theme_module()
  local config_dir = vim.env.AI_WORKTREES_NVIM_CONFIG_DIR
  if not config_dir then
    return
  end
  local theme_module = config_dir .. "/ai-worktrees-theme.lua"
  if vim.fn.filereadable(theme_module) ~= 1 then
    return
  end
  local mod = loadfile(theme_module)
  if mod then
    mod()
  end
end

local function apply_app_theme()
  load_theme_module()
  local theme = _G.AIWorktreesTheme or vim.env.AI_WORKTREES_THEME or "dark"
  if _G.AIWorktreesApplyTheme then
    pcall(_G.AIWorktreesApplyTheme, theme)
  end
end

local function nerd_tree_is_open()
  local ok, is_open = pcall(vim.fn.eval, "g:NERDTree.IsOpen()")
  return ok and is_open == 1
end

local function nerd_tree_window()
  for _, win in ipairs(vim.api.nvim_list_wins()) do
    local buf = vim.api.nvim_win_get_buf(win)
    if vim.api.nvim_buf_get_option(buf, "filetype") == "nerdtree" then
      return win
    end
  end
  return nil
end

local function open_nerd_tree_once()
  if nerd_tree_is_open() then
    return
  end
  vim.cmd("NERDTree")
end

local data_root = vim.env.AI_WORKTREES_NVIM_DATA or (vim.fn.stdpath("data") .. "-ai-worktrees")
local lazypath = data_root .. "/lazy/lazy.nvim"

if not vim.loop.fs_stat(lazypath) then
  vim.fn.system({
    "git",
    "clone",
    "--filter=blob:none",
    "https://github.com/folke/lazy.nvim.git",
    "--branch=stable",
    lazypath,
  })
end
vim.opt.rtp:prepend(lazypath)

require("lazy").setup({
  {
    "preservim/nerdtree",
    cmd = { "NERDTree", "NERDTreeToggle", "NERDTreeFind", "NERDTreeFocus" },
    init = function()
      vim.g.NERDTreeMinimalUI = 1
      vim.g.NERDTreeShowHidden = 1
      vim.g.NERDTreeWinSize = 32
      vim.g.NERDTreeQuitOnOpen = 0
    end,
  },
  {
    "nvim-treesitter/nvim-treesitter",
    lazy = true,
    event = { "BufReadPost", "BufNewFile" },
    opts = {
      ensure_installed = { "go", "javascript", "typescript" },
      highlight = { enable = true },
      indent = { enable = true },
    },
  },
})

vim.keymap.set("n", "<leader>e", ":NERDTreeToggle<CR>", { desc = "Toggle file tree" })
vim.keymap.set("n", "<leader>f", ":NERDTreeFind<CR>", { desc = "Reveal current file in tree" })
vim.keymap.set("n", "<S-J>", function()
  local tree_win = nerd_tree_window()
  if not tree_win then
    vim.cmd("NERDTree")
    return
  end
  if vim.api.nvim_get_current_win() == tree_win then
    vim.cmd("wincmd p")
  else
    vim.api.nvim_set_current_win(tree_win)
  end
end, { desc = "Switch focus: tree ↔ editor" })

vim.api.nvim_create_autocmd("VimEnter", {
  once = true,
  callback = function()
    vim.schedule(function()
      apply_app_theme()
      open_nerd_tree_once()
    end)
  end,
})
`;

function shouldUpgradeNvimConfig(config: string): boolean {
  if (!config.includes(`version: ${NVIM_CONFIG_VERSION}`)) return true;
  return false;
}

function migrateNvimConfig(config: string): string {
  if (shouldUpgradeNvimConfig(config)) {
    return DEFAULT_NVIM_CONFIG;
  }
  return config;
}

export function normalizeNvimConfig(value: string | undefined): string {
  if (typeof value !== 'string' || !value.trim()) {
    return DEFAULT_NVIM_CONFIG;
  }
  return migrateNvimConfig(value);
}
