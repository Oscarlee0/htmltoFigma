import { parse } from "node-html-parser";
import csstree from "css-tree";

figma.showUI(__html__, { width: 400, height: 450 });

figma.ui.onmessage = (msg) => {
  if (msg.type === "convert") {
    const html = msg.html;
    const css = msg.css;
    generateFigmaUI(html, css);
  }
};

function generateFigmaUI(htmlString: string, cssString: string) {
  const root = parse(htmlString);
  const cssRules = parseCSS(cssString);

  const frame = figma.createFrame();
  frame.name = "Generated UI";
  frame.layoutMode = "VERTICAL";
  frame.primaryAxisSizingMode = "AUTO";
  frame.counterAxisSizingMode = "AUTO";
  frame.paddingLeft = frame.paddingRight = 20;
  frame.paddingTop = frame.paddingBottom = 20;

  root.childNodes.forEach((element: any) => {
    if (element.nodeType === 1) {
      createFigmaNode(element, frame, cssRules);
    }
  });

  figma.closePlugin("Figma UI Generated! 🎉");
}

function createFigmaNode(
  element: any,
  parent: FrameNode,
  cssRules: Record<string, any>
) {
  let node: SceneNode | null = null;

  if (element.tagName === "div") {
    node = figma.createFrame();
    node.layoutMode = "VERTICAL";
    node.primaryAxisSizingMode = "AUTO";
  } else if (element.tagName.startsWith("h")) {
    node = figma.createText();
    if ("text" in element && typeof element.text === "string") {
      node.characters = element.text;
    }
    node.fontSize = 24;
  } else if (element.tagName === "p") {
    node = figma.createText();
    if ("text" in element && typeof element.text === "string") {
      node.characters = element.text;
    }
  } else if (element.tagName === "button") {
    node = figma.createFrame();
    node.layoutMode = "HORIZONTAL";
    node.primaryAxisSizingMode = "AUTO";
    node.counterAxisSizingMode = "AUTO";
    const text = figma.createText();
    if ("text" in element && typeof element.text === "string") {
      text.characters = element.text;
    }
    node.appendChild(text);
  } else if (element.tagName === "img") {
    node = figma.createRectangle();
  } else if (element.tagName === "ul") {
    node = figma.createFrame();
    node.layoutMode = "VERTICAL";
    element.childNodes.forEach((li: any) =>
      createFigmaNode(li, node as FrameNode, cssRules)
    );
  } else if (element.tagName === "li") {
    node = figma.createText();
    if ("text" in element && typeof element.text === "string") {
      node.characters = element.text;
    }
  }

  if (node) {
    applyStyles(node, element.tagName, cssRules);
    if ("appendChild" in parent) {
      parent.appendChild(node);
    }
  }
}

function applyStyles(
  node: SceneNode,
  tag: string,
  cssRules: Record<string, any>
) {
  const styles = cssRules[tag] || {};

  if ("resize" in node) {
    if (styles.width) node.resize(parseInt(styles.width), node.height);
    if (styles.height) node.resize(node.width, parseInt(styles.height));
  }
  if ("fills" in node && styles.background) {
    node.fills = [{ type: "SOLID", color: hexToRgb(styles.background) }];
  }
  if (styles.color && node.type === "TEXT") {
    node.fills = [{ type: "SOLID", color: hexToRgb(styles.color) }];
  }
}

function parseCSS(cssString: string): Record<string, any> {
  const cssAST = csstree.parse(cssString);
  const styles: Record<string, any> = {};

  csstree.walk(cssAST, (node: any) => {
    if (node.type === "Rule") {
      const selector = node.prelude.children?.head?.data || "";
      const properties: Record<string, any> = {};

      node.block.children.forEach((prop: any) => {
        if (prop.type === "Declaration") {
          properties[prop.property] = prop.value.children?.head?.data || "";
        }
      });

      if (selector) styles[selector] = properties;
    }
  });

  return styles;
}

function hexToRgb(hex: string) {
  hex = hex.replace("#", "");
  return {
    r: parseInt(hex.substring(0, 2), 16) / 255,
    g: parseInt(hex.substring(2, 4), 16) / 255,
    b: parseInt(hex.substring(4, 6), 16) / 255,
  };
}
