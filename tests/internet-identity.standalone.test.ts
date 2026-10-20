import assert from "node:assert/strict";
import { test } from "node:test";
import { enforceIdentity } from "@aihot/backend/editorial/writing";

test("集团消息不能被改写成未提及的淘宝或千问发布", () => {
  const input = { title: "阿里巴巴公布季度业绩", text: "阿里巴巴公布季度收入和经营利润。", sourceKind: "rss" };
  for (const name of ["淘宝", "千问"]) {
    const copy = enforceIdentity(input, { titleZh: `${name}发布新业务`, summaryZh: `${name}上线新功能。` });
    assert.equal(copy.identityGuard.outcome, "fallback");
    assert.equal(copy.titleZh, input.title);
    assert.equal(copy.summaryZh, "");
  }
});

test("不得把匿名平台的补贴措施张冠李戴给电商或本地生活公司", () => {
  const input = { title: "某平台调整商家补贴", text: "平台公布试点商家的补贴条件。", sourceKind: "rss" };
  for (const name of ["美团", "京东", "拼多多", "抖音", "小红书"]) {
    const copy = enforceIdentity(input, { titleZh: `${name}调整商家补贴`, summaryZh: `${name}公布试点条件。` });
    assert.equal(copy.identityGuard.outcome, "fallback", name);
  }
});

test("明确有来源支持的商家规则变化正常保留", () => {
  const input = { title: "美团公布商家规则", text: "美团公布了试点地区的商家服务费规则。", sourceKind: "rss" };
  const copy = { titleZh: "美团公布试点商家服务费规则", summaryZh: "美团公布试点地区的商家服务费规则。" };
  const result = enforceIdentity(input, copy);
  assert.equal(result.identityGuard.outcome, "pass");
  assert.equal(result.titleZh, copy.titleZh);
  assert.equal(result.summaryZh, copy.summaryZh);
});
