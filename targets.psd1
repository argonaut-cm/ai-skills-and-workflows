@{
    # Where each target expects a skill to live, and which files it understands.
    #
    # <name> is substituted with the skill's directory name under skills/.
    # A target marked Scope = 'project' installs into a repository rather than
    # the user profile, so sync.ps1 only writes it when -ProjectPath is supplied.
    #
    # AntiGravity is deliberately absent. It is an IDE, not a runner: the agents
    # working inside it are Claude Code, Codex and Gemini CLI, which are already
    # covered. An earlier version of this file modelled it as a third tool with
    # its own skill format, which described something that does not exist.
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
        'project-workflows' = @{
            Dest    = '<project>\.agent\workflows'
            Flatten = 'SKILL.md'
            Rename  = '<name>.md'
            Scope   = 'project'
            Note    = 'A project convention, not a tool directory: one flat .md per workflow under .agent/workflows. Verify the consuming project actually reads this path before relying on it.'
        }

        # Gemini CLI has no per-skill directory on this machine -- no ~/.gemini/
        # commands, extensions or GEMINI.md exist. Its global context file would
        # belong in Globals rather than here, as global\gemini\GEMINI.md, once
        # there is one to publish. Not stubbed, because a manifest entry with no
        # source file is a claim that something exists when it does not.
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

    # Which targets each skill is published to. A skill absent from a target's
    # list is deliberate, not an oversight -- record the reason here.
    Skills = @{
        'step-by-step'    = @('claude', 'codex', 'project-workflows')
        'next-step'       = @('claude', 'codex', 'project-workflows')
        'graphify'        = @('claude', 'codex')   # needs the graphify CLI; no flat-workflow equivalent

        # Both of these came from ~/.gemini/antigravity/skills and are coupled to
        # one project rather than tool-neutral: caveman pins a compression level
        # set in that repo's .caveman.json and cites its CLAUDE.md section, and
        # ext-nlm-relogin cites a section number and a PM directive. They are
        # published as-is rather than rewritten, because generalising them would
        # change what they mean. Treat the coupling as known, not as drift.
        'caveman'         = @('claude', 'codex')
        'ext-nlm-relogin' = @('claude', 'codex')
    }
}
