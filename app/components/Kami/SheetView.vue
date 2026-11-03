<script lang="ts">
import { defineComponent, type PropType } from 'vue';
import type {
    SheetAttribute,
    SheetAttributes,
    SheetBarValue,
    SheetLayout,
    SheetLayoutColumns,
    SheetListValue,
    SheetSection,
    SheetStatusItem,
    SheetStatusValue,
    SheetTableValue
} from '~~/shared/types/sheet';
import {
    clampAttributeRows,
    clampAttributeSpan,
    defaultAttributeSpanFor,
    SHEET_GALLERY_COLUMNS_MAX,
    SHEET_LAYOUT_ROW_HEIGHT,
    SHEET_LAYOUT_ROWS_MAX
} from '~~/shared/utils/sheet-layout';
import { SHEET_DESCRIPTION_MAX_LENGTH } from '~~/shared/constants/sheet';

type ViewMode = 'documento' | 'secoes';

interface ResolvedHeader {
    title: SheetAttribute | null;
    subtitle: SheetAttribute | null;
    image: SheetAttribute | null;
    imageWidth: number;
    titleSize: number;
}

const STORAGE_KEY = 'kami:ficha:modo';

export default defineComponent({
    name: 'KamiSheetView',
    props: {
        name: {
            type: String,
            default: ''
        },
        attributes: {
            type: Object as PropType<SheetAttributes>,
            required: true
        },
        layout: {
            type: Object as PropType<SheetLayout | null>,
            default: null
        },
        editable: {
            type: Boolean,
            default: false
        },
        adjustable: {
            type: Boolean,
            default: false
        },
        viewMode: {
            type: String as PropType<ViewMode | null>,
            default: null
        },
        selectedSection: {
            type: Number,
            default: null
        },
        showToggle: {
            type: Boolean,
            default: true
        }
    },
    emits: [
        'select-section',
        'adjust-bar',
        'adjust-quantity',
        'add-list-item',
        'remove-list-item',
        'move-list-item',
        'update-list-name',
        'update-description',
        'toggle-status'
    ],
    data() {
        return {
            mode: 'documento' as ViewMode,
            activeSection: 0,
            brokenImages: [] as string[],
            editingAttributes: [] as string[],
            editingDescriptions: [] as number[],
            descriptionMaxLength: SHEET_DESCRIPTION_MAX_LENGTH,
            sheetRowHeight: SHEET_LAYOUT_ROW_HEIGHT,
            lightboxImages: [] as SheetAttribute[],
            lightboxIndex: 0,
            numberRaf: null as number | null,
            numberObserver: null as ResizeObserver | null,
            dragListItem: null as { section: number; attribute: number; index: number } | null,
            dragOverListItem: null as { section: number; attribute: number; index: number } | null
        };
    },
    computed: {
        sections(): SheetSection[] {
            return this.attributes.sections ?? [];
        },
        visibleSections(): SheetSection[] {
            if (this.mode === 'documento') {
                return this.sections;
            }

            const section = this.sections[this.activeSection];
            return section ? [section] : [];
        },
        currentSection(): SheetSection | null {
            return this.sections[this.activeSection] ?? null;
        }
    },
    watch: {
        mode(value: ViewMode) {
            this.scheduleNumberSizes();

            if (this.viewMode || !import.meta.client) {
                return;
            }

            window.localStorage.setItem(STORAGE_KEY, value);
        },
        attributes: {
            deep: true,
            handler() {
                this.scheduleNumberSizes();
            }
        },
        layout: {
            deep: true,
            handler() {
                this.scheduleNumberSizes();
            }
        },
        sections() {
            if (this.activeSection >= this.sections.length) {
                this.activeSection = 0;
            }
        }
    },
    mounted() {
        if (this.viewMode === 'documento' || this.viewMode === 'secoes') {
            this.mode = this.viewMode;
        } else {
            const stored = window.localStorage.getItem(STORAGE_KEY);

            if (stored === 'documento' || stored === 'secoes') {
                this.mode = stored;
            }
        }

        this.$nextTick(() => {
            this.updateNumberSizes();

            if (typeof ResizeObserver !== 'undefined' && this.$el instanceof HTMLElement) {
                this.numberObserver = new ResizeObserver(() => this.scheduleNumberSizes());
                this.numberObserver.observe(this.$el);
            }
        });

        window.addEventListener('keydown', this.handleLightboxKeydown);
    },
    updated() {
        void this.$nextTick(() => this.fitHeaderTitles());
    },
    beforeUnmount() {
        window.removeEventListener('keydown', this.handleLightboxKeydown);
        this.numberObserver?.disconnect();
        this.numberObserver = null;

        if (this.numberRaf !== null) {
            window.cancelAnimationFrame(this.numberRaf);
            this.numberRaf = null;
        }
    },
    methods: {
        setMode(mode: ViewMode): void {
            this.mode = mode;
        },
        selectSection(index: number): void {
            this.activeSection = index;
        },
        previousSection(): void {
            if (this.activeSection > 0) {
                this.activeSection -= 1;
            }
        },
        nextSection(): void {
            if (this.activeSection < this.sections.length - 1) {
                this.activeSection += 1;
            }
        },
        sectionAnchor(index: number): string {
            return `secao-${index}`;
        },
        sectionIndex(section: SheetSection): number {
            return this.sections.indexOf(section);
        },
        sectionTypeLabel(type: number): string {
            if (type === 1) {
                return 'DESCRIÇÃO';
            }

            if (type === 2) {
                return 'CABEÇALHO';
            }

            if (type === 3) {
                return 'STATUS';
            }

            if (type === 4) {
                return 'GALERIA';
            }

            if (type === 5) {
                return 'TABELA';
            }

            return 'PADRÃO';
        },
        headerOf(section: SheetSection): ResolvedHeader | null {
            if (section.type !== 2) {
                return null;
            }

            const entry = this.layout?.sections?.[section.name]?.header;

            if (!entry) {
                return null;
            }

            const byName = new Map(section.attributes.map(attribute => [attribute.name, attribute]));
            const title = entry.title ? byName.get(entry.title) : undefined;
            const subtitle = entry.subtitle ? byName.get(entry.subtitle) : undefined;
            const image = entry.image ? byName.get(entry.image) : undefined;
            const resolvedTitle = title?.type === 0 ? title : null;
            const resolvedSubtitle = subtitle?.type === 0 ? subtitle : null;
            const resolvedImage = image?.type === 2 ? image : null;

            if (!resolvedTitle && !resolvedSubtitle && !resolvedImage) {
                return null;
            }

            return {
                title: resolvedTitle,
                subtitle: resolvedSubtitle,
                image: resolvedImage,
                imageWidth:
                    typeof entry.imageWidth === 'number' ? Math.min(12, Math.max(1, Math.trunc(entry.imageWidth))) : 4,
                titleSize:
                    typeof entry.titleSize === 'number' ? Math.min(96, Math.max(32, Math.trunc(entry.titleSize))) : 56
            };
        },
        headerTitle(section: SheetSection): string {
            return String(this.headerOf(section)?.title?.value ?? '');
        },
        headerSubtitle(section: SheetSection): string {
            return String(this.headerOf(section)?.subtitle?.value ?? '');
        },
        headerImage(section: SheetSection): SheetAttribute | null {
            const image = this.headerOf(section)?.image;

            if (!image || !String(image.value).trim()) {
                return null;
            }

            return image;
        },
        isHeaderAttribute(section: SheetSection, attribute: SheetAttribute): boolean {
            const header = this.headerOf(section);

            return Boolean(
                header && (header.title === attribute || header.subtitle === attribute || header.image === attribute)
            );
        },
        freeAttributes(section: SheetSection): SheetAttribute[] {
            const header = this.headerOf(section);

            return section.attributes.filter(
                attribute =>
                    !header ||
                    (attribute !== header.title && attribute !== header.subtitle && attribute !== header.image)
            );
        },
        sectionStyle(section: SheetSection): Record<string, string> {
            const style: Record<string, string> = { '--sheet-span': String(this.sectionSpan(section)) };
            const header = this.headerOf(section);

            if (header) {
                style['--header-image-width'] = `${(header.imageWidth / 12) * 100}%`;
                style['--header-title-size'] = `${header.titleSize}px`;
            }

            return style;
        },
        statusOf(section: SheetSection): SheetStatusValue | null {
            if (section.type !== 3) {
                return null;
            }

            const attribute = section.attributes.find(item => item.type === 5);

            if (!attribute || !attribute.value || typeof attribute.value !== 'object') {
                return null;
            }

            return 'items' in attribute.value && Array.isArray(attribute.value.items)
                ? (attribute.value as SheetStatusValue)
                : null;
        },
        statusItems(section: SheetSection): SheetStatusItem[] {
            return this.statusOf(section)?.items ?? [];
        },
        toggleStatus(sectionIndex: number, itemIndex: number): void {
            this.$emit('toggle-status', { section: sectionIndex, index: itemIndex });
        },
        galleryOf(section: SheetSection): SheetAttribute[] {
            return section.type === 4
                ? section.attributes.filter(attribute => attribute.type === 2 && String(attribute.value).trim())
                : [];
        },
        galleryColumns(section: SheetSection): number {
            const stored = this.layout?.sections?.[section.name]?.columns;
            const parsed = typeof stored === 'number' ? stored : Number(stored);

            if (!Number.isFinite(parsed)) {
                return 3;
            }

            return Math.min(SHEET_GALLERY_COLUMNS_MAX, Math.max(1, Math.trunc(parsed)));
        },
        gallerySpan(section: SheetSection, attribute: SheetAttribute): number {
            const columns = this.galleryColumns(section);
            const stored = this.layout?.sections?.[section.name]?.attributes?.[attribute.name]?.span;
            const parsed = typeof stored === 'number' ? stored : Number(stored);

            return Number.isFinite(parsed) ? clampAttributeSpan(parsed, columns) : 1;
        },
        openGallery(sectionIndex: number, imageIndex: number): void {
            const section = this.sections[sectionIndex];

            if (section) {
                this.openLightbox(this.galleryOf(section), imageIndex);
            }
        },
        openImage(attribute: SheetAttribute): void {
            this.openLightbox([attribute], 0);
        },
        openHeaderImage(section: SheetSection): void {
            const image = this.headerImage(section);

            if (image) {
                this.openImage(image);
            }
        },
        openLightbox(images: SheetAttribute[], index: number): void {
            this.lightboxImages = images;
            this.lightboxIndex = index;

            void this.$nextTick(() => {
                (this.$refs.lightboxDialog as HTMLElement | undefined)?.focus();
            });
        },
        closeLightbox(): void {
            this.lightboxImages = [];
            this.lightboxIndex = 0;
        },
        currentLightboxImage(): SheetAttribute | null {
            return this.lightboxImages[this.lightboxIndex] ?? null;
        },
        nextLightboxImage(): void {
            const total = this.lightboxImages.length;

            if (total > 1) {
                this.lightboxIndex = (this.lightboxIndex + 1) % total;
            }
        },
        previousLightboxImage(): void {
            const total = this.lightboxImages.length;

            if (total > 1) {
                this.lightboxIndex = (this.lightboxIndex - 1 + total) % total;
            }
        },
        handleLightboxKeydown(event: KeyboardEvent): void {
            if (this.lightboxImages.length === 0) {
                return;
            }

            if (event.key === 'Escape') {
                event.preventDefault();
                this.closeLightbox();
                return;
            }

            if (event.key === 'ArrowRight') {
                event.preventDefault();
                this.nextLightboxImage();
                return;
            }

            if (event.key === 'ArrowLeft') {
                event.preventDefault();
                this.previousLightboxImage();
            }
        },
        tableOf(section: SheetSection): SheetTableValue | null {
            if (section.type !== 5) {
                return null;
            }

            const attribute = section.attributes.find(item => item.type === 6);

            if (!attribute || !attribute.value || typeof attribute.value !== 'object') {
                return null;
            }

            return 'columns' in attribute.value && Array.isArray(attribute.value.columns)
                ? (attribute.value as SheetTableValue)
                : null;
        },
        showsDescription(section: SheetSection): boolean {
            if (section.type !== 1) {
                return false;
            }

            const [attribute] = section.attributes;

            return !attribute || (section.attributes.length === 1 && attribute.type === 0);
        },
        canEditDescription(section: SheetSection): boolean {
            return this.adjustable && this.showsDescription(section);
        },
        isDescriptionEditing(sectionIndex: number): boolean {
            return this.editingDescriptions.includes(sectionIndex);
        },
        toggleDescriptionEdit(sectionIndex: number, event?: MouseEvent): void {
            const index = this.editingDescriptions.indexOf(sectionIndex);

            if (index >= 0) {
                this.editingDescriptions.splice(index, 1);
                return;
            }

            this.editingDescriptions.push(sectionIndex);

            const section = (event?.currentTarget as HTMLElement | null)?.closest('.site-sheetview__secao') ?? null;

            void this.$nextTick(() => {
                section?.querySelector<HTMLTextAreaElement>('.site-sheetview__descricao-edicao')?.focus();
            });
        },
        emitDescription(sectionIndex: number, event: Event): void {
            this.$emit('update-description', {
                section: sectionIndex,
                value: (event.target as HTMLTextAreaElement).value
            });
        },
        descriptionText(section: SheetSection): string {
            const attribute = section.attributes[0];

            if (section.type !== 1 || section.attributes.length !== 1 || !attribute || attribute.type !== 0) {
                return '';
            }

            return String(attribute.value);
        },
        scheduleNumberSizes(): void {
            if (!import.meta.client || this.numberRaf !== null) {
                return;
            }

            this.numberRaf = window.requestAnimationFrame(() => {
                this.numberRaf = null;
                this.updateNumberSizes();
            });
        },
        fitHeaderTitles(): void {
            if (!import.meta.client) {
                return;
            }

            const root = this.$el as HTMLElement | null;

            if (!root || typeof root.querySelectorAll !== 'function') {
                return;
            }

            root.querySelectorAll<HTMLElement>('.site-sheetview__cabecalho-titulo').forEach(title => {
                const max = Math.min(96, Math.max(32, Number(title.dataset.titleSize) || 56));
                const available = title.parentElement?.clientWidth ?? title.clientWidth;

                if (available <= 0) {
                    return;
                }

                let size = max;
                title.style.fontSize = `${size}px`;

                while (size > 18 && title.scrollWidth > available) {
                    size -= 2;
                    title.style.fontSize = `${size}px`;
                }
            });
        },
        updateNumberSizes(): void {
            if (!import.meta.client) {
                return;
            }

            const root = this.$el as HTMLElement | null;

            if (!root || typeof root.querySelectorAll !== 'function') {
                return;
            }

            root.querySelectorAll<HTMLElement>('.site-sheetview__numero').forEach(node => {
                const article = node.closest<HTMLElement>('.site-sheetview__atributo');

                if (!article) {
                    return;
                }

                const style = getComputedStyle(article);
                const padX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
                const padY = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
                const header = article.querySelector<HTMLElement>('.site-sheetview__atributo-topo');
                const headerHeight = header ? header.getBoundingClientRect().height : 0;
                const availableWidth = Math.max(0, article.clientWidth - padX);
                const availableHeight = Math.max(0, article.clientHeight - padY - headerHeight);
                const text = (node.textContent ?? '').trim();
                const digits = Math.max(1, text.replace(/\D/g, '').length + (text.startsWith('-') ? 1 : 0));
                const widthLimit = availableWidth / (digits * 0.62);
                const heightLimit = availableHeight * 0.94;
                const size = Math.max(12, Math.min(240, widthLimit, heightLimit));

                node.style.fontSize = `${Math.round(size)}px`;
            });

            this.fitHeaderTitles();
        },
        adjustBar(sectionIndex: number, attributeIndex: number, delta: number): void {
            this.$emit('adjust-bar', { section: sectionIndex, attribute: attributeIndex, delta });
        },
        adjustQuantity(sectionIndex: number, attributeIndex: number, itemIndex: number, delta: number): void {
            this.$emit('adjust-quantity', {
                section: sectionIndex,
                attribute: attributeIndex,
                index: itemIndex,
                delta
            });
        },
        addListItem(sectionIndex: number, attributeIndex: number): void {
            this.$emit('add-list-item', { section: sectionIndex, attribute: attributeIndex });
        },
        removeListItem(sectionIndex: number, attributeIndex: number, itemIndex: number): void {
            this.$emit('remove-list-item', { section: sectionIndex, attribute: attributeIndex, index: itemIndex });
        },
        moveListItem(sectionIndex: number, attributeIndex: number, from: number, to: number): void {
            this.$emit('move-list-item', { section: sectionIndex, attribute: attributeIndex, from, to });
        },
        handleListItemDragStart(
            sectionIndex: number,
            attributeIndex: number,
            itemIndex: number,
            event: DragEvent
        ): void {
            this.dragListItem = { section: sectionIndex, attribute: attributeIndex, index: itemIndex };
            this.dragOverListItem = { section: sectionIndex, attribute: attributeIndex, index: itemIndex };
            event.dataTransfer?.setData('text/plain', String(itemIndex));

            if (event.dataTransfer) {
                event.dataTransfer.effectAllowed = 'move';
            }
        },
        handleListItemDragOver(
            sectionIndex: number,
            attributeIndex: number,
            itemIndex: number,
            event: DragEvent
        ): void {
            event.preventDefault();
            this.dragOverListItem = { section: sectionIndex, attribute: attributeIndex, index: itemIndex };

            if (event.dataTransfer) {
                event.dataTransfer.dropEffect = 'move';
            }
        },
        handleListItemDrop(sectionIndex: number, attributeIndex: number, itemIndex: number): void {
            const from = this.dragListItem;

            this.clearListItemDrag();

            if (!from || from.section !== sectionIndex || from.attribute !== attributeIndex) {
                return;
            }

            if (from.index !== itemIndex) {
                this.moveListItem(sectionIndex, attributeIndex, from.index, itemIndex);
            }
        },
        clearListItemDrag(): void {
            this.dragListItem = null;
            this.dragOverListItem = null;
        },
        attributeKey(sectionIndex: number, attributeIndex: number): string {
            return `${sectionIndex}:${attributeIndex}`;
        },
        isEditingAttribute(sectionIndex: number, attributeIndex: number): boolean {
            return this.editingAttributes.includes(this.attributeKey(sectionIndex, attributeIndex));
        },
        toggleAttributeEdit(sectionIndex: number, attributeIndex: number): void {
            const key = this.attributeKey(sectionIndex, attributeIndex);
            const index = this.editingAttributes.indexOf(key);

            if (index >= 0) {
                this.editingAttributes.splice(index, 1);
                this.clearListItemDrag();
                return;
            }

            this.editingAttributes.push(key);
        },
        emitListItemName(sectionIndex: number, attributeIndex: number, itemIndex: number, event: Event): void {
            const value = (event.target as HTMLInputElement).value;

            this.$emit('update-list-name', {
                section: sectionIndex,
                attribute: attributeIndex,
                index: itemIndex,
                value
            });
        },
        sectionColumns(section: SheetSection): SheetLayoutColumns {
            const columns = this.layout?.sections?.[section.name]?.columns;
            const parsed = typeof columns === 'number' ? columns : Number(columns);

            if (!Number.isFinite(parsed)) {
                return 1;
            }

            return Math.min(12, Math.max(1, Math.trunc(parsed)));
        },
        attributeSpan(section: SheetSection, attribute: SheetAttribute): number {
            const columns = this.sectionColumns(section);
            const stored = this.layout?.sections?.[section.name]?.attributes?.[attribute.name]?.span;
            const parsed = typeof stored === 'number' ? stored : Number(stored);

            if (Number.isFinite(parsed)) {
                return clampAttributeSpan(parsed, columns);
            }

            return defaultAttributeSpanFor(section.type, attribute.type, columns);
        },
        sectionSpan(section: SheetSection): number {
            const span = this.layout?.sections?.[section.name]?.span;
            const parsed = typeof span === 'number' ? span : Number(span);

            if (!Number.isFinite(parsed)) {
                return 12;
            }

            return Math.min(12, Math.max(1, Math.trunc(parsed)));
        },
        sectionRows(section: SheetSection): number | null {
            const rows = this.layout?.sections?.[section.name]?.rows;

            if (typeof rows !== 'number' || !Number.isFinite(rows)) {
                return null;
            }

            return Math.min(SHEET_LAYOUT_ROWS_MAX, Math.max(1, Math.trunc(rows)));
        },
        sectionDense(section: SheetSection): boolean {
            return this.layout?.sections?.[section.name]?.dense === true;
        },
        attributeRows(section: SheetSection, attribute: SheetAttribute): number {
            const rows = this.sectionRows(section);

            if (rows === null) {
                return 1;
            }

            const stored = this.layout?.sections?.[section.name]?.attributes?.[attribute.name]?.rows;

            return clampAttributeRows(typeof stored === 'number' ? stored : 1, rows);
        },
        gridStyle(section: SheetSection): Record<string, string> {
            const rows = this.sectionRows(section);
            const style: Record<string, string> = {
                '--sheet-cols': String(this.sectionColumns(section)),
                '--sheet-rows': String(rows ?? 1),
                '--sheet-row-height': `${this.sheetRowHeight}px`
            };

            if (rows !== null) {
                style.gridTemplateRows = `repeat(${rows}, minmax(${this.sheetRowHeight}px, auto))`;
            }

            return style;
        },
        handleSelect(index: number): void {
            if (this.editable) {
                this.$emit('select-section', index);
            }
        },
        isListValue(value: SheetAttribute['value']): value is SheetListValue {
            return Boolean(value) && typeof value === 'object' && Array.isArray((value as SheetListValue).items);
        },
        isBarValue(value: SheetAttribute['value']): value is SheetBarValue {
            return (
                Boolean(value) &&
                typeof value === 'object' &&
                typeof (value as SheetBarValue).actual === 'number' &&
                typeof (value as SheetBarValue).max === 'number'
            );
        },
        asList(value: SheetAttribute['value']): SheetListValue {
            return value as SheetListValue;
        },
        asBar(value: SheetAttribute['value']): SheetBarValue {
            return value as SheetBarValue;
        },
        isImageValue(value: string): boolean {
            try {
                const url = new URL(value);

                if (url.protocol !== 'http:' && url.protocol !== 'https:') {
                    return false;
                }

                return /\.(png|jpe?g|gif|svg|webp)$/i.test(url.pathname);
            } catch {
                return false;
            }
        },
        isImageBroken(url: string): boolean {
            return this.brokenImages.includes(url);
        },
        markImageBroken(url: string): void {
            if (!this.brokenImages.includes(url)) {
                this.brokenImages.push(url);
            }
        },
        barLabel(value: SheetBarValue): string {
            return `${value.actual} / ${value.max}`;
        }
    }
});
</script>

<template>
    <div class="site-sheetview">
        <div
            v-if="showToggle"
            class="site-sheetview__topo"
        >
            <p class="site-eyebrow">VISUALIZAÇÃO</p>
            <div
                class="site-sheetview__toggle"
                role="group"
                aria-label="Modo de visualização"
            >
                <button
                    type="button"
                    class="site-sheetview__toggle-btn"
                    :class="{ 'site-sheetview__toggle-btn--ativo': mode === 'documento' }"
                    :aria-pressed="mode === 'documento'"
                    @click="setMode('documento')"
                >
                    DOCUMENTO
                </button>
                <button
                    type="button"
                    class="site-sheetview__toggle-btn"
                    :class="{ 'site-sheetview__toggle-btn--ativo': mode === 'secoes' }"
                    :aria-pressed="mode === 'secoes'"
                    @click="setMode('secoes')"
                >
                    SEÇÕES
                </button>
            </div>
        </div>

        <div
            v-if="!sections.length"
            class="site-sheetview__vazio"
            role="status"
        >
            ESTA FICHA AINDA NÃO TEM SEÇÕES.
        </div>

        <template v-else>
            <nav
                v-if="mode === 'documento'"
                class="site-sheetview__indice"
                aria-label="Seções da ficha"
            >
                <a
                    v-for="(section, index) in sections"
                    :key="index"
                    :href="`#${sectionAnchor(index)}`"
                    class="site-sheetview__indice-link"
                >
                    {{ section.name }}
                </a>
            </nav>

            <nav
                v-else
                class="site-sheetview__secoes-nav"
                aria-label="Seções da ficha"
            >
                <button
                    v-for="(section, index) in sections"
                    :key="index"
                    type="button"
                    class="site-sheetview__secao-btn"
                    :class="{ 'site-sheetview__secao-btn--ativa': index === activeSection }"
                    :aria-pressed="index === activeSection"
                    @click="selectSection(index)"
                >
                    {{ section.name }}
                </button>
            </nav>

            <div
                class="site-sheetview__corpo"
                :class="{ 'site-sheetview__corpo--secoes': mode === 'secoes' }"
            >
                <section
                    v-for="section in visibleSections"
                    :key="section.name + sectionIndex(section)"
                    :id="mode === 'documento' ? sectionAnchor(sectionIndex(section)) : undefined"
                    class="site-sheetview__secao"
                    :class="{
                        'site-sheetview__secao--descricao': section.type === 1,
                        'site-sheetview__secao--cabecalho': section.type === 2,
                        'site-sheetview__secao--cabecalho-sem-imagem': section.type === 2 && !headerImage(section),
                        'site-sheetview__secao--editavel': editable,
                        'site-sheetview__secao--selecionada': editable && selectedSection === sectionIndex(section)
                    }"
                    :style="sectionStyle(section)"
                    :tabindex="editable ? 0 : undefined"
                    @click="handleSelect(sectionIndex(section))"
                    @keydown.enter.prevent="handleSelect(sectionIndex(section))"
                >
                    <header
                        v-if="section.type !== 2"
                        class="site-sheetview__secao-topo"
                    >
                        <h2 class="site-sheetview__secao-nome">{{ section.name }}</h2>
                        <span class="site-sheetview__secao-meta">
                            <span
                                v-if="editable"
                                class="site-sheetview__secao-largura"
                            >
                                {{ sectionSpan(section) }}/12
                            </span>
                            <button
                                v-if="canEditDescription(section)"
                                type="button"
                                class="site-sheetview__toggle-edicao"
                                :aria-pressed="isDescriptionEditing(sectionIndex(section))"
                                @click.stop="toggleDescriptionEdit(sectionIndex(section), $event)"
                            >
                                {{ isDescriptionEditing(sectionIndex(section)) ? 'CONCLUIR' : 'EDITAR' }}
                            </button>
                            <span
                                v-if="editable"
                                class="site-sheetview__tipo"
                            >
                                {{ sectionTypeLabel(section.type) }}
                            </span>
                        </span>
                    </header>

                    <div
                        v-if="section.type === 2 && headerOf(section)"
                        class="site-sheetview__cabecalho-topo"
                    >
                        <h2
                            class="site-sheetview__cabecalho-titulo"
                            :data-title-size="headerOf(section)?.titleSize"
                        >
                            {{ headerTitle(section) }}
                        </h2>
                        <p
                            v-if="headerSubtitle(section)"
                            class="site-sheetview__cabecalho-subtitulo"
                        >
                            {{ headerSubtitle(section) }}
                        </p>
                    </div>

                    <figure
                        v-if="section.type === 2 && headerImage(section)"
                        class="site-sheetview__cabecalho-imagem"
                    >
                        <button
                            v-if="headerImage(section)"
                            type="button"
                            class="site-sheetview__cabecalho-imagem-botao"
                            :aria-label="`Ampliar ${headerImage(section)?.name || 'imagem'}`"
                            @click.stop="openHeaderImage(section)"
                        >
                            <img
                                v-if="!isImageBroken(String(headerImage(section)?.value))"
                                :src="String(headerImage(section)?.value)"
                                :alt="headerTitle(section)"
                                loading="lazy"
                                referrerpolicy="no-referrer"
                                @error="markImageBroken(String(headerImage(section)?.value))"
                            />
                            <span
                                v-else
                                class="site-sheetview__vazio"
                            >
                                IMAGEM INDISPONÍVEL.
                            </span>
                        </button>
                        <figcaption>{{ headerImage(section)?.name || 'IMAGEM' }}</figcaption>
                    </figure>

                    <div
                        v-if="section.type === 3"
                        class="site-sheetview__status"
                    >
                        <template
                            v-for="(item, index) in statusItems(section)"
                            :key="item.id"
                        >
                            <button
                                v-if="adjustable"
                                type="button"
                                class="site-sheetview__status-chip"
                                :class="{
                                    'site-sheetview__status-chip--ativo': item.active,
                                    'site-sheetview__status-chip--blink': item.active && item.blink
                                }"
                                :style="{ '--status-color': item.color }"
                                :aria-pressed="item.active"
                                @click.stop="toggleStatus(sectionIndex(section), index)"
                            >
                                <span
                                    class="site-sheetview__status-icone"
                                    aria-hidden="true"
                                >
                                    <img
                                        v-if="item.icon && !isImageBroken(item.icon)"
                                        :src="item.icon"
                                        alt=""
                                        loading="lazy"
                                        referrerpolicy="no-referrer"
                                        @error="markImageBroken(item.icon)"
                                    />
                                    <span
                                        v-else
                                        class="site-sheetview__status-icone-padrao"
                                    ></span>
                                </span>
                                <span class="site-sheetview__status-nome">{{ item.name }}</span>
                            </button>
                            <span
                                v-else
                                class="site-sheetview__status-chip"
                                :class="{
                                    'site-sheetview__status-chip--ativo': item.active,
                                    'site-sheetview__status-chip--blink': item.active && item.blink
                                }"
                                :style="{ '--status-color': item.color }"
                            >
                                <span
                                    class="site-sheetview__status-icone"
                                    aria-hidden="true"
                                >
                                    <img
                                        v-if="item.icon && !isImageBroken(item.icon)"
                                        :src="item.icon"
                                        alt=""
                                        loading="lazy"
                                        referrerpolicy="no-referrer"
                                        @error="markImageBroken(item.icon)"
                                    />
                                    <span
                                        v-else
                                        class="site-sheetview__status-icone-padrao"
                                    ></span>
                                </span>
                                <span class="site-sheetview__status-nome">{{ item.name }}</span>
                            </span>
                        </template>
                        <p
                            v-if="!statusItems(section).length"
                            class="site-sheetview__vazio"
                        >
                            NENHUM STATUS.
                        </p>
                    </div>

                    <div
                        v-else-if="section.type === 4"
                        class="site-sheetview__galeria"
                        :style="{ '--gallery-cols': galleryColumns(section) }"
                    >
                        <figure
                            v-for="(image, imageIndex) in galleryOf(section)"
                            :key="image.name + imageIndex"
                            class="site-sheetview__galeria-item"
                            :style="{ 'grid-column': `span ${gallerySpan(section, image)}` }"
                        >
                            <button
                                type="button"
                                class="site-sheetview__galeria-botao"
                                :aria-label="`Ampliar ${image.name || 'imagem'}`"
                                @click.stop="openGallery(sectionIndex(section), imageIndex)"
                            >
                                <img
                                    v-if="!isImageBroken(String(image.value))"
                                    :src="String(image.value)"
                                    :alt="image.name"
                                    loading="lazy"
                                    referrerpolicy="no-referrer"
                                    @error="markImageBroken(String(image.value))"
                                />
                                <span
                                    v-else
                                    class="site-sheetview__vazio"
                                >
                                    IMAGEM INDISPONÍVEL.
                                </span>
                            </button>
                            <figcaption>{{ image.name || 'IMAGEM' }}</figcaption>
                        </figure>
                        <p
                            v-if="!galleryOf(section).length"
                            class="site-sheetview__vazio"
                        >
                            GALERIA VAZIA.
                        </p>
                    </div>

                    <div
                        v-else-if="section.type === 5"
                        class="site-sheetview__tabela-scroll"
                    >
                        <table
                            v-if="tableOf(section)?.columns.length"
                            class="site-sheetview__tabela"
                        >
                            <thead>
                                <tr>
                                    <th
                                        v-for="(column, columnIndex) in tableOf(section)?.columns"
                                        :key="columnIndex"
                                    >
                                        {{ column }}
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr
                                    v-for="(row, rowIndex) in tableOf(section)?.rows"
                                    :key="rowIndex"
                                >
                                    <td
                                        v-for="(cell, cellIndex) in row"
                                        :key="cellIndex"
                                    >
                                        {{ cell }}
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                        <p
                            v-else
                            class="site-sheetview__vazio"
                        >
                            TABELA VAZIA.
                        </p>
                    </div>

                    <template v-else-if="showsDescription(section)">
                        <textarea
                            v-if="isDescriptionEditing(sectionIndex(section))"
                            class="site-sheetview__descricao-edicao"
                            :value="descriptionText(section)"
                            :maxlength="descriptionMaxLength"
                            rows="6"
                            aria-label="Texto da descrição"
                            @click.stop
                            @input="emitDescription(sectionIndex(section), $event)"
                        ></textarea>
                        <p
                            v-else-if="descriptionText(section)"
                            class="site-sheetview__descricao"
                        >
                            {{ descriptionText(section) }}
                        </p>
                        <p
                            v-else
                            class="site-sheetview__vazio"
                        >
                            DESCRIÇÃO VAZIA.
                        </p>
                    </template>

                    <p
                        v-else-if="!freeAttributes(section).length"
                        class="site-sheetview__vazio"
                    >
                        SEM ATRIBUTOS NESTA SEÇÃO.
                    </p>

                    <div
                        v-else
                        class="site-sheetview__grade"
                        :class="{
                            'site-sheetview__grade--dense': sectionDense(section),
                            'site-sheetview__grade--rows': sectionRows(section) !== null
                        }"
                        :style="gridStyle(section)"
                    >
                        <template
                            v-for="(attribute, attributeIndex) in section.attributes"
                            :key="attributeIndex"
                        >
                            <article
                                v-if="!isHeaderAttribute(section, attribute)"
                                class="site-sheetview__atributo"
                                :class="`site-sheetview__atributo--tipo-${attribute.type}`"
                                :style="`--attr-span: ${attributeSpan(section, attribute)}; --attr-rows: ${attributeRows(
                                    section,
                                    attribute
                                )}`"
                            >
                                <header class="site-sheetview__atributo-topo">
                                    <h3 class="site-sheetview__atributo-nome">{{ attribute.name }}</h3>
                                    <button
                                        v-if="adjustable && attribute.type === 3"
                                        type="button"
                                        class="site-sheetview__toggle-edicao"
                                        :aria-pressed="isEditingAttribute(sectionIndex(section), attributeIndex)"
                                        @click.stop="toggleAttributeEdit(sectionIndex(section), attributeIndex)"
                                    >
                                        {{
                                            isEditingAttribute(sectionIndex(section), attributeIndex)
                                                ? 'CONCLUIR'
                                                : 'EDITAR'
                                        }}
                                    </button>
                                </header>

                                <p
                                    v-if="attribute.type === 0"
                                    class="site-sheetview__texto"
                                >
                                    {{ String(attribute.value) }}
                                </p>

                                <p
                                    v-else-if="attribute.type === 1"
                                    class="site-sheetview__numero"
                                >
                                    {{ String(attribute.value) }}
                                </p>

                                <template v-else-if="attribute.type === 2">
                                    <figure
                                        v-if="
                                            isImageValue(String(attribute.value)) &&
                                            !isImageBroken(String(attribute.value))
                                        "
                                        class="site-sheetview__imagem"
                                    >
                                        <button
                                            type="button"
                                            class="site-sheetview__imagem-botao"
                                            :aria-label="`Ampliar ${attribute.name || 'imagem'}`"
                                            @click.stop="openImage(attribute)"
                                        >
                                            <img
                                                :src="String(attribute.value)"
                                                :alt="attribute.name"
                                                loading="lazy"
                                                referrerpolicy="no-referrer"
                                                @error="markImageBroken(String(attribute.value))"
                                            />
                                        </button>
                                    </figure>
                                    <p
                                        v-else
                                        class="site-sheetview__texto site-sheetview__texto--fallback"
                                    >
                                        {{ String(attribute.value) || 'IMAGEM NÃO INFORMADA' }}
                                    </p>
                                </template>

                                <template v-else-if="attribute.type === 3">
                                    <ul
                                        v-if="isListValue(attribute.value) && asList(attribute.value).items.length"
                                        class="site-sheetview__lista"
                                    >
                                        <li
                                            v-for="(item, itemIndex) in asList(attribute.value).items"
                                            :key="itemIndex"
                                            class="site-sheetview__lista-item"
                                            :class="{
                                                'site-sheetview__lista-item--ajustavel': isEditingAttribute(
                                                    sectionIndex(section),
                                                    attributeIndex
                                                ),
                                                'site-sheetview__lista-item--arrastando':
                                                    dragListItem?.section === sectionIndex(section) &&
                                                    dragListItem?.attribute === attributeIndex &&
                                                    dragListItem?.index === itemIndex,
                                                'site-sheetview__lista-item--alvo':
                                                    dragOverListItem?.section === sectionIndex(section) &&
                                                    dragOverListItem?.attribute === attributeIndex &&
                                                    dragOverListItem?.index === itemIndex &&
                                                    dragListItem?.index !== itemIndex
                                            }"
                                            :draggable="
                                                isEditingAttribute(sectionIndex(section), attributeIndex)
                                                    ? 'true'
                                                    : 'false'
                                            "
                                            @dragstart="
                                                isEditingAttribute(sectionIndex(section), attributeIndex) &&
                                                handleListItemDragStart(
                                                    sectionIndex(section),
                                                    attributeIndex,
                                                    itemIndex,
                                                    $event
                                                )
                                            "
                                            @dragover="
                                                isEditingAttribute(sectionIndex(section), attributeIndex) &&
                                                handleListItemDragOver(
                                                    sectionIndex(section),
                                                    attributeIndex,
                                                    itemIndex,
                                                    $event
                                                )
                                            "
                                            @drop.prevent="
                                                isEditingAttribute(sectionIndex(section), attributeIndex) &&
                                                handleListItemDrop(sectionIndex(section), attributeIndex, itemIndex)
                                            "
                                            @dragend="clearListItemDrag"
                                        >
                                            <span
                                                v-if="isEditingAttribute(sectionIndex(section), attributeIndex)"
                                                class="site-sheetview__lista-alca"
                                                aria-hidden="true"
                                            >
                                                ⋮⋮
                                            </span>
                                            <input
                                                v-if="isEditingAttribute(sectionIndex(section), attributeIndex)"
                                                class="kami-input site-sheetview__lista-entrada"
                                                type="text"
                                                maxlength="32"
                                                :value="item.name"
                                                :aria-label="`Nome do item ${itemIndex + 1}`"
                                                @input="
                                                    emitListItemName(
                                                        sectionIndex(section),
                                                        attributeIndex,
                                                        itemIndex,
                                                        $event
                                                    )
                                                "
                                            />
                                            <span
                                                v-else
                                                class="site-sheetview__lista-nome"
                                                >{{ item.name }}</span
                                            >
                                            <span class="site-sheetview__quantidade">{{ item.quantity }}</span>
                                            <span
                                                v-if="isEditingAttribute(sectionIndex(section), attributeIndex)"
                                                class="site-sheetview__lista-acoes"
                                            >
                                                <button
                                                    type="button"
                                                    class="site-sheetview__lista-btn"
                                                    :disabled="Number(item.quantity) <= 1"
                                                    :aria-label="`Diminuir ${item.name || 'item'}`"
                                                    @click.stop="
                                                        adjustQuantity(
                                                            sectionIndex(section),
                                                            attributeIndex,
                                                            itemIndex,
                                                            -1
                                                        )
                                                    "
                                                >
                                                    −
                                                </button>
                                                <button
                                                    type="button"
                                                    class="site-sheetview__lista-btn"
                                                    :aria-label="`Aumentar ${item.name || 'item'}`"
                                                    @click.stop="
                                                        adjustQuantity(
                                                            sectionIndex(section),
                                                            attributeIndex,
                                                            itemIndex,
                                                            1
                                                        )
                                                    "
                                                >
                                                    +
                                                </button>
                                                <button
                                                    type="button"
                                                    class="site-sheetview__lista-btn"
                                                    :disabled="itemIndex === 0"
                                                    :aria-label="`Mover ${item.name || 'item'} para cima`"
                                                    @click.stop="
                                                        moveListItem(
                                                            sectionIndex(section),
                                                            attributeIndex,
                                                            itemIndex,
                                                            itemIndex - 1
                                                        )
                                                    "
                                                >
                                                    ↑
                                                </button>
                                                <button
                                                    type="button"
                                                    class="site-sheetview__lista-btn"
                                                    :disabled="itemIndex >= asList(attribute.value).items.length - 1"
                                                    :aria-label="`Mover ${item.name || 'item'} para baixo`"
                                                    @click.stop="
                                                        moveListItem(
                                                            sectionIndex(section),
                                                            attributeIndex,
                                                            itemIndex,
                                                            itemIndex + 1
                                                        )
                                                    "
                                                >
                                                    ↓
                                                </button>
                                                <button
                                                    type="button"
                                                    class="site-sheetview__lista-btn site-sheetview__lista-btn--remover"
                                                    :aria-label="`Remover ${item.name || 'item'}`"
                                                    @click.stop="
                                                        removeListItem(sectionIndex(section), attributeIndex, itemIndex)
                                                    "
                                                >
                                                    ×
                                                </button>
                                            </span>
                                        </li>
                                    </ul>
                                    <p
                                        v-else
                                        class="site-sheetview__vazio"
                                    >
                                        LISTA VAZIA.
                                    </p>
                                    <button
                                        v-if="isEditingAttribute(sectionIndex(section), attributeIndex)"
                                        type="button"
                                        class="site-sheetview__lista-add"
                                        @click.stop="addListItem(sectionIndex(section), attributeIndex)"
                                    >
                                        + ITEM
                                    </button>
                                </template>

                                <div
                                    v-else-if="attribute.type === 4 && isBarValue(attribute.value)"
                                    class="site-sheetview__barra"
                                >
                                    <div class="site-sheetview__barra-topo">
                                        <span>{{ barLabel(asBar(attribute.value)) }}</span>
                                        <span
                                            v-if="adjustable"
                                            class="site-sheetview__barra-acoes"
                                        >
                                            <button
                                                type="button"
                                                class="site-sheetview__barra-btn"
                                                :disabled="asBar(attribute.value).actual <= asBar(attribute.value).min"
                                                :aria-label="`Diminuir ${attribute.name}`"
                                                @click.stop="adjustBar(sectionIndex(section), attributeIndex, -1)"
                                            >
                                                −
                                            </button>
                                            <button
                                                type="button"
                                                class="site-sheetview__barra-btn"
                                                :disabled="asBar(attribute.value).actual >= asBar(attribute.value).max"
                                                :aria-label="`Aumentar ${attribute.name}`"
                                                @click.stop="adjustBar(sectionIndex(section), attributeIndex, 1)"
                                            >
                                                +
                                            </button>
                                        </span>
                                    </div>
                                    <KamiBarTrack
                                        :value="asBar(attribute.value)"
                                        :label="attribute.name"
                                    />
                                </div>
                            </article>
                        </template>
                    </div>
                </section>
            </div>

            <div
                v-if="mode === 'secoes' && sections.length > 1"
                class="site-sheetview__paginacao"
            >
                <button
                    type="button"
                    class="site-sheetview__pagina-btn"
                    :disabled="activeSection === 0"
                    @click="previousSection"
                >
                    ANTERIOR
                </button>
                <span class="site-sheetview__pagina-contador">{{ activeSection + 1 }} / {{ sections.length }}</span>
                <button
                    type="button"
                    class="site-sheetview__pagina-btn"
                    :disabled="activeSection >= sections.length - 1"
                    @click="nextSection"
                >
                    PRÓXIMA
                </button>
            </div>
        </template>

        <Teleport to="body">
            <div
                v-if="currentLightboxImage()"
                ref="lightboxDialog"
                class="site-sheetview__lightbox"
                role="dialog"
                aria-modal="true"
                :aria-label="`Imagem ampliada: ${currentLightboxImage()?.name || 'imagem'}`"
                tabindex="-1"
                @click.self="closeLightbox"
            >
                <div class="site-sheetview__lightbox-conteudo">
                    <button
                        v-if="lightboxImages.length > 1"
                        type="button"
                        class="site-sheetview__lightbox-nav site-sheetview__lightbox-nav--anterior"
                        aria-label="Imagem anterior"
                        @click="previousLightboxImage"
                    >
                        ‹
                    </button>

                    <figure class="site-sheetview__lightbox-figura">
                        <button
                            type="button"
                            class="site-sheetview__lightbox-fechar"
                            aria-label="Fechar imagem ampliada"
                            @click="closeLightbox"
                        >
                            ×
                        </button>
                        <img
                            v-if="!isImageBroken(String(currentLightboxImage()?.value))"
                            :src="String(currentLightboxImage()?.value)"
                            :alt="currentLightboxImage()?.name || 'Imagem'"
                            referrerpolicy="no-referrer"
                            @error="markImageBroken(String(currentLightboxImage()?.value))"
                        />
                        <span
                            v-else
                            class="site-sheetview__vazio"
                        >
                            IMAGEM INDISPONÍVEL.
                        </span>
                        <figcaption>
                            <span>{{ currentLightboxImage()?.name || 'IMAGEM' }}</span>
                            <span v-if="lightboxImages.length > 1">
                                {{ lightboxIndex + 1 }} / {{ lightboxImages.length }}
                            </span>
                        </figcaption>
                    </figure>

                    <button
                        v-if="lightboxImages.length > 1"
                        type="button"
                        class="site-sheetview__lightbox-nav site-sheetview__lightbox-nav--proxima"
                        aria-label="Próxima imagem"
                        @click="nextLightboxImage"
                    >
                        ›
                    </button>
                </div>
            </div>
        </Teleport>
    </div>
</template>
