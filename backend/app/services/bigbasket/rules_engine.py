import logging
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field

from app.services.bigbasket.gemini_service import GeminiProductClassification

logger = logging.getLogger(__name__)


class CategoryProcessingRules(BaseModel):
    """
    Resolved dynamic category-specific image-processing rules per Phase 6.
    """
    primary_category: str  # "FOOD", "NON_FOOD", "KITCHEN_ITEMS", "UNKNOWN"
    active_rules: List[str] = Field(default_factory=list)

    # Food-specific flags
    preserve_food_colour: bool = False
    preserve_natural_texture: bool = False
    protect_irregular_boundaries: bool = False
    fssai_compliance_mandated: bool = False
    nutrition_table_mandated: bool = False

    # Non-food specific flags
    preserve_product_shape: bool = False
    protect_fine_components: bool = False

    # Kitchen Items specific flags
    metal_reflection_guard: bool = False
    glass_transparency_guard: bool = False
    handle_preservation_guard: bool = False
    lid_knob_mesh_guard: bool = False

    # Lifestyle & Infographic flags
    preserve_lifestyle_environment: bool = False
    requires_background_removal: bool = True

    # Framing Specs
    is_fop_bop: bool = True
    padding_top: int = 180
    padding_bottom: int = 180
    padding_left: int = 100
    padding_right: int = 100
    target_width: int = 2000
    target_height: int = 2000
    min_dpi: int = 150


class DynamicRulesEngine:
    """
    Configurable processing rule engine that resolves and applies
    category-specific rules derived dynamically from Gemini's classification.
    """

    @classmethod
    def resolve_rules(
        cls,
        classification: GeminiProductClassification,
        image_type: Optional[str] = None,
    ) -> CategoryProcessingRules:
        """
        Dynamically derives the set of applicable image-processing rules
        from Gemini classification output (category, materials, components, visual properties).
        """
        cat = (classification.primary_category or "UNKNOWN").upper()
        eff_img_type = (image_type or classification.image_type or "FOP").upper()

        is_flat_panel = eff_img_type in (
            "INGREDIENT", "NUTRITION", "MANUFACTURER", "FSSAI", "BARCODE",
            "LIFESTYLE", "INFOGRAPHIC"
        )
        is_fop_bop = not is_flat_panel

        pad_t = 0 if is_flat_panel else 180
        pad_b = 0 if is_flat_panel else 180
        pad_l = 0 if is_flat_panel else 100
        pad_r = 0 if is_flat_panel else 100

        is_lifestyle_or_infographic = eff_img_type in ("LIFESTYLE", "INFOGRAPHIC")

        rules = CategoryProcessingRules(
            primary_category=cat,
            is_fop_bop=is_fop_bop,
            requires_background_removal=not (is_flat_panel or is_lifestyle_or_infographic),
            preserve_lifestyle_environment=is_lifestyle_or_infographic,
            padding_top=pad_t,
            padding_bottom=pad_b,
            padding_left=pad_l,
            padding_right=pad_r,
        )

        if is_lifestyle_or_infographic:
            rules.active_rules.extend([
                "rule.lifestyle.environment_preservation",
                "rule.lifestyle.no_background_removal",
                "rule.lifestyle.edge_to_edge_2000x2000",
                "rule.lifestyle.preserve_composition_and_text",
            ])

        materials_lower = [m.name.lower() for m in classification.materials]
        components_lower = [c.lower() for c in classification.components]
        visual_props_lower = [v.lower() for v in classification.visual_properties]

        # -------------------------------------------------------------
        # 1. FOOD CATEGORY RULES
        # -------------------------------------------------------------
        if cat == "FOOD":
            rules.preserve_food_colour = True
            rules.preserve_natural_texture = True
            rules.protect_irregular_boundaries = True
            rules.fssai_compliance_mandated = True
            rules.nutrition_table_mandated = True
            rules.active_rules.extend([
                "rule.food.preserve_natural_color",
                "rule.food.texture_preservation",
                "rule.food.boundary_integrity",
                "rule.food.fssai_compliance",
                "rule.food.nutrition_extraction",
            ])

        # -------------------------------------------------------------
        # 2. KITCHEN ITEMS CATEGORY RULES (Cookware, Utensils, Storage)
        # -------------------------------------------------------------
        elif cat == "KITCHEN_ITEMS":
            rules.preserve_product_shape = True
            rules.active_rules.append("rule.kitchen.contour_integrity")

            # Multi-Product Kit / Cookware Set preservation
            if classification.is_multi_product_image or len(classification.detected_products) > 1:
                rules.active_rules.extend([
                    "rule.kitchen.multi_product_kit_preservation",
                    "rule.kitchen.composite_set_integrity",
                ])
                rules.handle_preservation_guard = True
                rules.metal_reflection_guard = True
                rules.glass_transparency_guard = True
                rules.lid_knob_mesh_guard = True

            # Metals (Cookware, steel, aluminium, brass)
            is_metal = any(m in materials_lower for m in ["stainless_steel", "steel", "aluminium", "aluminum", "copper", "cast_iron", "metal"])
            has_reflection = any(v in visual_props_lower for v in ["reflective", "glossy", "metallic"])
            if is_metal or has_reflection:
                rules.metal_reflection_guard = True
                rules.active_rules.extend([
                    "rule.kitchen.metal.sheen_guard",
                    "rule.kitchen.metal.reflection_protection",
                    "rule.kitchen.metal.thin_edge_protection",
                ])

            # Glass (Bowls, jars, lids, containers)
            is_glass = any(m in materials_lower for m in ["glass", "borosilicate", "borosilicate_glass"])
            has_transparency = any(v in visual_props_lower for v in ["transparent", "translucent"]) or any("transparent" in c for c in components_lower)
            if is_glass or has_transparency:
                rules.glass_transparency_guard = True
                rules.active_rules.extend([
                    "rule.kitchen.glass.transparency_preservation",
                    "rule.kitchen.glass.boundary_verification",
                ])

            # Handles (Pans, cookers, ladles, strainers)
            has_handles = any("handle" in c for c in components_lower) or any("spatula" in c or "spoon" in c for c in components_lower)
            if has_handles or cat == "KITCHEN_ITEMS":
                rules.handle_preservation_guard = True
                rules.active_rules.extend([
                    "rule.kitchen.handles.narrow_handle_protection",
                    "rule.kitchen.handles.connection_integrity",
                    "rule.kitchen.handles.severance_detection",
                ])

            # Small Components (Lids, knobs, blades, mesh, spouts)
            has_other_parts = any(c in components_lower for c in ["lid", "knob", "spout", "blade", "mesh", "rim", "hinge"])
            if has_other_parts:
                rules.lid_knob_mesh_guard = True
                rules.active_rules.extend([
                    "rule.kitchen.components.lid_knob_preservation",
                    "rule.kitchen.components.mesh_opening_preservation",
                    "rule.kitchen.components.blade_spout_protection",
                ])

        # -------------------------------------------------------------
        # 3. NON-FOOD CATEGORY RULES (Personal Care, Cleaning, Plastics)
        # -------------------------------------------------------------
        else:  # NON_FOOD or UNKNOWN
            rules.preserve_product_shape = True
            rules.protect_fine_components = True
            rules.active_rules.extend([
                "rule.non_food.geometric_contour",
                "rule.non_food.nozzle_pump_protection",
                "rule.non_food.statutory_exemption",
            ])
            # If the item has handles (e.g. Joyo bucket), preserve handle connection
            if any("handle" in c for c in components_lower) or "bucket" in classification.product_type.lower():
                rules.handle_preservation_guard = True
                rules.active_rules.append("rule.non_food.handle_loop_protection")

        return rules

