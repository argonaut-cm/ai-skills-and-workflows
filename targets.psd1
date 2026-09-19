@{
    # Where each tool expects a skill to live, and which files it understands.
    #
    # <name> is substituted with the skill's directory name under skills/.
    # A tool marked Scope = 'project' installs into a repository rather than the
    # user profile, so sync.ps1 only writes it when -ProjectPath is supplied.
    Tools = @{
        claude = @{
            Dest    = '$HOME\.claude\skills\<name>'
            Include = @('SKILL.md', 'references')
            Scope   = 'user'
            Note    = 'Claude Code reads ~/.claude/skills. It ignores agents/openai.yaml.'
        }
        codex = @{
            Dest    = '$HOME\.codex\skills\<name>'
            Include = @('SKILL.md', 'references', 'agents')
            Scope   = 'user'
            Note    = 'Codex CLI reads ~/.codex/skills and uses agents/openai.yaml for its picker.'
        }
        antigravity = @{
            Dest    = '<project>\.agent\workflows'
            Flatten = 'SKILL.md'
            Rename  = '<name>.md'
            Scope   = 'project'
            Note    = 'AntiGravity reads project workflows, one flat .md per workflow.'
        }
    }

    # Single files that configure a tool globally rather than adding a skill.
    # They are not skills, so they carry an explicit source and destination
    # instead of going through the Tools table.
    Globals = @{
        'claude-output-style' = @{
            From = 'global\claude\CLAUDE.md'
            Dest = '$HOME\.claude\CLAUDE.md'
            Note = 'Global output style. Authored 2026-09-19; the original was lost in the 13-Sep wipe and no copy survived.'
        }
    }

    # Which tools each skill is published to. A skill absent from a tool's list
    # is deliberate, not an oversight -- record the reason here.
    Skills = @{
        'step-by-step' = @('claude', 'codex', 'antigravity')
        'next-step'    = @('claude', 'codex', 'antigravity')
        'graphify'     = @('claude', 'codex')   # needs the graphify CLI; no AG workflow equivalent
    }
}
