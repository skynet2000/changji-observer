import { Text, useText } from "@aihot/web/lib/text";
import type { ReactNode } from "react";
import { Link } from "react-router";
import type { CopyDocument, RenderedCopy } from "../../lib/markdown";
import { ArticleLayout, RailSection } from "../../components/ui/Page";
import { PhoneBar } from "../../components/shell/PhoneBar";

/**
 * Legal and policy pages, read like articles: the document on the page in one column, its facts in the
 * left rail and its outline in the right (phones get the facts above the text and no outline).
 */
export function CopyPage({ doc, rendered, eyebrow, footer, aside }: { doc: CopyDocument; rendered: RenderedCopy; eyebrow?: ReactNode; footer?: ReactNode; aside?: ReactNode }) {
  const translate = useText();
  const facts = (["版本", "生效日期", "运营主体", "联系方式", "备案号"] as const).filter((k) => doc.meta[k]);
  const info = facts.length > 0 && (
    <RailSection title={translate("文档信息")}>
      <dl className="space-y-2 text-[12.5px]">
        {facts.map((k) => (
          <div key={k}>
            <dt className="text-ink-4"><Text>{k}</Text></dt>
            <dd className="mt-0.5 text-ink-2"><Text>{doc.meta[k]}</Text></dd>
          </div>
        ))}
      </dl>
    </RailSection>
  );
  const outline = rendered.outline.length > 2 && (
    <RailSection title={translate("目录")}>
      <nav aria-label={translate("目录")}>
        <ol className="-ml-px space-y-0.5 border-l border-line">
          {rendered.outline.map((o) => (
            <li key={o.id}>
              <a href={`#${o.id}`} className="-ml-px block border-l border-transparent py-1 pl-3 text-[12.5px] leading-snug text-ink-3 transition-colors hover:border-accent hover:text-ink">
                <Text>{o.text}</Text>
              </a>
            </li>
          ))}
        </ol>
      </nav>
    </RailSection>
  );
  return (
    <>
    <PhoneBar back={{ to: "/more", label: "我的" }} title={translate(doc.title)} />
    <ArticleLayout
      left={
        <>
          {aside}
          <Text>{info}</Text>
        </>
      }
      right={
        <>
          <div className="space-y-8 2xl:hidden"><Text>{info}</Text></div>
          <Text>{outline}</Text>
        </>
      }
    >
      <article className="pb-14 pt-3 lg:pt-2">
        {eyebrow && <div className="mb-2.5 text-[12px] font-semibold text-accent"><Text>{eyebrow}</Text></div>}
        <h1 data-page-title="" className="text-[26px] font-bold leading-[1.35] text-ink lg:text-[32px] xl:text-[36px] xl:leading-[1.3]"><Text>{doc.title}</Text></h1>
        {doc.intro && <p className="mt-4 text-[15px] leading-[1.8] text-ink-3 xl:text-[16px]"><Text>{doc.intro}</Text></p>}
        {facts.length > 0 && (
          <dl className="mt-5 grid grid-cols-1 border-y border-line text-[12.5px] sm:grid-cols-2 lg:hidden">
            {facts.map((k) => (
              <div key={k} className="flex gap-4 border-b border-line-soft py-2.5 last:border-b-0 sm:[&:nth-last-child(-n+2)]:border-b-0">
                <dt className="w-16 shrink-0 text-ink-4"><Text>{k}</Text></dt>
                <dd className="min-w-0 text-ink-2"><Text>{doc.meta[k]}</Text></dd>
              </div>
            ))}
          </dl>
        )}
        <div className="prose prose-compact mt-6 lg:mt-8" dangerouslySetInnerHTML={{ __html: rendered.html }} />
        {footer && <div className="mt-12 border-t border-line pt-5 text-[12.5px] text-ink-3"><Text>{footer}</Text></div>}
      </article>
    </ArticleLayout>
    </>
  );
}

export function LegalFooterLinks({ links, note }: { links: Array<{ to: string; label: string; id?: string }>; note?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      {links.map((l) => (
        <Link key={l.to} id={l.id} to={l.to} className="text-accent hover:underline"><Text>{l.label}</Text></Link>
      ))}
      {note && <span className="text-ink-4"><Text>{note}</Text></span>}
    </div>
  );
}
