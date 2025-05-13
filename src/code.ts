import { XMLParser } from "fast-xml-parser";
import * as csstree from "css-tree";

// Show the plugin UI
figma.showUI(__html__, { width: 400, height: 450 });

// Configure the HTML parser with fast-xml-parser
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  preserveOrder: true,
});

console.log("Parser configured:", parser);

// Listen for messages from the UI
figma.ui.onmessage = async (msg) => {
  console.log("Message received from UI:", msg);
  if (msg.type === "convert") {
    const html = msg.html;
    const css = msg.css;
    console.log("Received HTML:", html);
    console.log("Received CSS:", css);
    await generateFigmaUI(html, css);
  }
};

// Main function to generate Figma UI from HTML and CSS strings
async function generateFigmaUI(htmlString: string, cssString: string) {
  try {
    // Parse the HTML into a DOM tree and CSS into rules
    const domTree = parser.parse(htmlString);
    const cssRules = parseCSS(cssString);

    console.log("Parsed DOM Tree:", JSON.stringify(domTree, null, 2));
    console.log("Parsed CSS Rules:", JSON.stringify(cssRules, null, 2));

    // Create the root frame for the UI
    const frame = figma.createFrame();
    frame.name = "Generated UI";
    frame.layoutMode = "VERTICAL";
    frame.primaryAxisSizingMode = "AUTO";
    frame.counterAxisSizingMode = "AUTO";
    frame.paddingLeft = frame.paddingRight = 20;
    frame.paddingTop = frame.paddingBottom = 20;
    console.log("Created main frame:", frame);

    // Render the parsed DOM tree into the frame, starting with empty effective styles
    await renderElements(
      Array.isArray(domTree) ? domTree : [domTree],
      frame,
      cssRules,
      {}
    );

    // Add the frame to the current Figma page
    figma.currentPage.appendChild(frame);
    console.log("Appended frame to page.");

    figma.closePlugin("UI Generated Successfully!");
  } catch (error: unknown) {
    console.error("Error generating Figma UI:", error);
    if (error instanceof Error) {
      figma.closePlugin(`Error: ${error.message}`);
    } else {
      figma.closePlugin("An unknown error occurred.");
    }
  }
}

// Recursively renders HTML nodes into Figma nodes
async function renderElements(
  nodes: any[] | any,
  parent: FrameNode | PageNode,
  cssRules: Record<string, any>,
  effectiveStyles: Record<string, any> = {}
) {
  const nodesArray = Array.isArray(nodes) ? nodes : [nodes];

  if (!nodesArray || nodesArray.length === 0) {
    console.log("renderElements called with empty or null nodes array.");
    return;
  }

  console.log(
    "renderElements called with nodes:",
    nodesArray,
    "Parent:",
    parent.name || parent.type
  );

  for (const node of nodesArray) {
    if (typeof node !== "object" || node === null) {
      console.warn("Skipping invalid node:", node);
      continue;
    }

    const nodeType = Object.keys(node)[0];
    const content = node[nodeType];

    console.log("Processing nodeType:", nodeType, "Content:", content);

    if (nodeType === "#text") {
      if (typeof content === "string" && content.trim()) {
        const textNode = figma.createText();

        // Determine font from effectiveStyles
        const fontFamilyList = effectiveStyles["font-family"]
          ?.split(",")
          .map((f: string) => f.trim().replace(/['"]/g, "")) || ["Inter"];
        const fontFamily = fontFamilyList[0];
        const fontWeight = effectiveStyles["font-weight"] || "normal";
        const fontStyle = effectiveStyles["font-style"] || "normal";

        // Map to Figma font style
        let figmaStyle = "Regular";
        if (
          fontWeight === "bold" ||
          (typeof fontWeight === "string" && parseInt(fontWeight) >= 700)
        ) {
          figmaStyle = fontStyle === "italic" ? "Bold Italic" : "Bold";
        } else if (fontStyle === "italic") {
          figmaStyle = "Italic";
        }

        // Load the font with fallback
        try {
          await figma.loadFontAsync({ family: fontFamily, style: figmaStyle });
          textNode.fontName = { family: fontFamily, style: figmaStyle };
        } catch (e) {
          console.warn(
            `Font ${fontFamily} ${figmaStyle} not available, falling back to Inter Regular`
          );
          await figma.loadFontAsync({ family: "Inter", style: "Regular" });
          textNode.fontName = { family: "Inter", style: "Regular" };
        }

        textNode.characters = content.trim();
        textNode.textAutoResize = "WIDTH_AND_HEIGHT";

        // Apply color
        const color = effectiveStyles["color"];
        if (color) {
          try {
            textNode.fills = [{ type: "SOLID", color: parseColorToRgb(color) }];
          } catch (e) {
            console.warn(`Could not apply text color: ${color}`, e);
          }
        } else {
          textNode.fills = [{ type: "SOLID", color: { r: 0, g: 0, b: 0 } }]; // Default black
        }

        parent.appendChild(textNode);
        console.log("Appended TextNode:", textNode.characters);
      }
    } else if (nodeType === ":@") {
      continue; // Skip attribute nodes
    } else if (
      ["html", "head", "meta", "title", "link", "script", "style"].includes(
        nodeType
      )
    ) {
      console.log(`Skipping non-visual element: <${nodeType}>`);
      if (Array.isArray(content)) {
        await renderElements(content, parent, cssRules, effectiveStyles);
      }
    } else {
      const tagName = nodeType;
      let attributes: Record<string, any> = {};
      let childrenContent: any[] = [];

      if (Array.isArray(content)) {
        for (const child of content) {
          if (typeof child === "object" && child !== null) {
            const childType = Object.keys(child)[0];
            if (childType === ":@") {
              attributes = child[childType];
            } else {
              childrenContent.push(child);
            }
          }
        }
      }

      const frame = figma.createFrame();
      frame.name = tagName;
      frame.layoutMode = "VERTICAL"; // Default, overridden in applyStyles if needed
      frame.primaryAxisSizingMode = "AUTO";
      frame.counterAxisSizingMode = "AUTO";

      const styles = applyStyles(
        frame,
        tagName,
        attributes,
        cssRules,
        effectiveStyles
      );

      parent.appendChild(frame);
      if (childrenContent.length > 0) {
        await renderElements(childrenContent, frame, cssRules, styles);
      }
    }
  }
}

// Applies CSS styles to Figma nodes and returns computed styles
function applyStyles(
  node: SceneNode,
  tagName: string,
  attributes: Record<string, any>,
  cssRules: Record<string, any>,
  parentEffectiveStyles: Record<string, any>
): Record<string, any> {
  const classes = attributes.class?.split(" ") || [];
  const id = attributes.id;
  let ownStyles: Record<string, any> = { ...cssRules[tagName] };

  classes.forEach((cls: string) => {
    if (cssRules["." + cls]) {
      ownStyles = { ...ownStyles, ...cssRules["." + cls] };
    }
  });
  if (id && cssRules["#" + id]) {
    ownStyles = { ...ownStyles, ...cssRules["#" + id] };
  }

  // Combine inherited styles with own styles
  const inheritableProps = [
    "color",
    "font-family",
    "font-weight",
    "font-style",
    "font-size",
  ];
  const styles = { ...parentEffectiveStyles };
  inheritableProps.forEach((prop) => {
    if (ownStyles[prop]) {
      styles[prop] = ownStyles[prop];
    }
  });
  Object.keys(ownStyles).forEach((prop) => {
    if (!inheritableProps.includes(prop)) {
      styles[prop] = ownStyles[prop];
    }
  });

  console.log("Applying styles to", node.name, "with styles:", styles);

  if ("resize" in node) {
    if (styles.width) {
      const width = parseInt(styles.width);
      if (!isNaN(width)) node.resize(width, node.height);
    }
    if (styles.height) {
      const height = parseInt(styles.height);
      if (!isNaN(height)) node.resize(node.width, height);
    }
  }

  if ("layoutMode" in node) {
    if (styles["display"] === "flex") {
      const flexDirection = styles["flex-direction"] || "row";
      node.layoutMode = flexDirection === "row" ? "HORIZONTAL" : "VERTICAL";
      if (styles["gap"]) {
        const gap = parseInt(styles["gap"]);
        if (!isNaN(gap)) node.itemSpacing = gap;
      }
    } else {
      node.layoutMode = "VERTICAL"; // Default
    }
  }

  if ("fills" in node && styles["background-color"]) {
    try {
      node.fills = [
        { type: "SOLID", color: parseColorToRgb(styles["background-color"]) },
      ];
      console.log("Applied background color:", styles["background-color"]);
    } catch (e) {
      console.warn(
        "Could not apply background color:",
        styles["background-color"],
        e
      );
    }
  } else if ("fills" in node) {
    node.fills = [{ type: "SOLID", color: { r: 0.95, g: 0.95, b: 0.95 } }]; // Light gray default
    console.log("Applied default light gray background.");
  }

  return styles;
}

// Parses CSS string into a rules object
function parseCSS(cssString: string): Record<string, any> {
  const cssAST = csstree.parse(cssString);
  const styles: Record<string, any> = {};

  csstree.walk(cssAST, (node: any) => {
    if (node.type === "Rule") {
      const selector = (csstree as any).generate(node.prelude).trim();
      const properties: Record<string, any> = {};

      if (node.block && node.block.children) {
        node.block.children.forEach((prop: any) => {
          if (prop.type === "Declaration") {
            const propertyName = prop.property;
            const propertyValue = (csstree as any).generate(prop.value).trim();
            properties[propertyName] = propertyValue;
            console.log(
              "Parsed CSS property:",
              propertyName,
              "Value:",
              propertyValue
            );
          }
        });
      }

      if (selector && Object.keys(properties).length > 0) {
        styles[selector] = properties;
        console.log("Parsed CSS rule:", selector, styles[selector]);
      } else if (selector) {
        console.log("Parsed CSS rule with no declarations:", selector);
      }
    }
  });

  console.log("Final Parsed CSS Rules:", styles);
  return styles;
}

// Parses CSS colors to Figma RGB format
function parseColorToRgb(color: string): { r: number; g: number; b: number } {
  color = color.trim().toLowerCase();

  // Handle named colors
  const namedColors: Record<string, { r: number; g: number; b: number }> = {
    white: { r: 1, g: 1, b: 1 },
    black: { r: 0, g: 0, b: 0 },
    red: { r: 1, g: 0, b: 0 },
    green: { r: 0, g: 1, b: 0 },
    blue: { r: 0, g: 0, b: 1 },
  };

  if (namedColors[color]) {
    return namedColors[color];
  }

  // Handle hex colors
  if (color.startsWith("#")) {
    let hex = color.replace("#", "");
    if (hex.length === 3) {
      hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    }
    if (hex.length === 6) {
      return {
        r: parseInt(hex.substring(0, 2), 16) / 255,
        g: parseInt(hex.substring(2, 4), 16) / 255,
        b: parseInt(hex.substring(4, 6), 16) / 255,
      };
    }
  }

  // Default to black if unsupported
  console.warn(`Unsupported color format: ${color}, defaulting to black`);
  return { r: 0, g: 0, b: 0 };
}
