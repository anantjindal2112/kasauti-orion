import { ButtonLink } from "@/components/retro/Button";
import { Icon } from "@/components/retro/Icon";
import { Window } from "@/components/retro/Window";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl pt-10">
      <Window title="C:\KASAUTI\ERROR.LOG" color="red">
        <div className="border-2 border-ink bg-term p-4 font-mono text-paper">
          <p className="text-yellow">&gt; open this_page</p>
          <p className="mt-2 text-term-red">[FAIL] 404 · FILE NOT FOUND</p>
          <p className="text-term-green">No evidence this page exists.</p>
          <p className="mt-2 text-yellow">
            &gt; <span className="cursor-blink">_</span>
          </p>
        </div>
        <div className="mt-5">
          <ButtonLink href="/" variant="primary">
            <Icon name="home" /> Back to home
          </ButtonLink>
        </div>
      </Window>
    </div>
  );
}
