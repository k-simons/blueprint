/*
 * Copyright 2017 Palantir Technologies, Inc. All rights reserved.
 *
 * Licensed under the terms of the LICENSE file distributed with this project.
 */

import * as classNames from "classnames";
import * as React from "react";

import {
    Button,
    Classes as CoreClasses,
    HTMLInputProps,
    IInputGroupProps,
    InputGroup,
    IPopoverProps,
    Keys,
    Menu,
    Popover,
    Position,
    Utils,
} from "@blueprintjs/core";
import * as Classes from "../../common/classes";
import { IListItemsProps, IQueryListRendererProps, QueryList } from "../query-list/queryList";

export interface ISelectProps<T> extends IListItemsProps<T> {
    /**
     * Whether the dropdown list can be filtered.
     * Disabling this option will remove the `InputGroup` and ignore `inputProps`.
     * @default true
     */
    filterable?: boolean;

    /**
     * React child to render when query is empty.
     */
    initialContent?: React.ReactChild;

    /**
     * Whether the component is non-interactive.
     * Note that you'll also need to disable the component's children, if appropriate.
     * @default false
     */
    disabled?: boolean;

    /** React child to render when filtering items returns zero results. */
    noResults?: React.ReactChild;

    /**
     * Props to spread to `InputGroup`. All props are supported except `ref` (use `inputRef` instead).
     * If you want to control the filter input, you can pass `value` and `onChange` here
     * to override `Select`'s own behavior.
     */
    inputProps?: IInputGroupProps & HTMLInputProps;

    /** Props to spread to `Popover`. Note that `content` cannot be changed. */
    popoverProps?: Partial<IPopoverProps> & object;

    /**
     * Whether the filtering state should be reset to initial when an item is selected
     * (immediately before `onItemSelect` is invoked). The query will become the empty string
     * and the first item will be made active.
     * @default false
     */
    resetOnSelect?: boolean;

    /**
     * Whether the filtering state should be reset to initial when the popover closes.
     * The query will become the empty string and the first item will be made active.
     * @default false
     */
    resetOnClose?: boolean;

    /**
     * Callback invoked when the query value changes,
     * through user input or when the filter is reset.
     */
    onQueryChange?: (query: string) => void;
}

export interface ISelectState<T> {
    activeItem?: T;
    isOpen?: boolean;
    query?: string;
}

export class Select<T> extends React.PureComponent<ISelectProps<T>, ISelectState<T>> {
    public static displayName = "Blueprint2.Select";

    public static ofType<T>() {
        return Select as new (props: ISelectProps<T>) => Select<T>;
    }

    public state: ISelectState<T> = { isOpen: false, query: "" };

    private input: HTMLInputElement;
    private TypedQueryList = QueryList.ofType<T>();
    private list: QueryList<T>;
    private refHandlers = {
        input: (ref: HTMLInputElement) => {
            this.input = ref;

            const { inputProps = {} } = this.props;
            Utils.safeInvoke(inputProps.inputRef, ref);
        },
        queryList: (ref: QueryList<T>) => (this.list = ref),
    };
    private previousFocusedElement: HTMLElement;

    constructor(props: ISelectProps<T>, context?: any) {
        super(props, context);

        const query = props && props.inputProps && props.inputProps.value !== undefined ? props.inputProps.value : "";
        this.state = { isOpen: false, query };
    }

    public render() {
        // omit props specific to this component, spread the rest.
        const { filterable, initialContent, inputProps, noResults, popoverProps, ...restProps } = this.props;

        return (
            <this.TypedQueryList
                {...restProps}
                activeItem={this.state.activeItem}
                onActiveItemChange={this.handleActiveItemChange}
                onItemSelect={this.handleItemSelect}
                query={this.state.query}
                ref={this.refHandlers.queryList}
                renderer={this.renderQueryList}
            />
        );
    }

    public componentWillReceiveProps(nextProps: ISelectProps<T>) {
        const { inputProps: nextInputProps = {} } = nextProps;
        if (nextInputProps.value !== undefined && this.state.query !== nextInputProps.value) {
            this.setState({ query: nextInputProps.value });
        }
    }

    public componentDidUpdate(_prevProps: ISelectProps<T>, prevState: ISelectState<T>) {
        if (this.state.isOpen && !prevState.isOpen && this.list != null) {
            this.list.scrollActiveItemIntoView();
        }
    }

    private renderQueryList = (listProps: IQueryListRendererProps<T>) => {
        // not using defaultProps cuz they're hard to type with generics (can't use <T> on static members)
        const { filterable = true, disabled = false, inputProps = {}, popoverProps = {} } = this.props;

        const input = (
            <InputGroup
                autoFocus={true}
                leftIcon="search"
                placeholder="Filter..."
                rightElement={this.maybeRenderInputClearButton()}
                value={listProps.query}
                {...inputProps}
                inputRef={this.refHandlers.input}
                onChange={this.handleQueryChange}
            />
        );

        const { handleKeyDown, handleKeyUp } = listProps;
        return (
            <Popover
                autoFocus={false}
                enforceFocus={false}
                isOpen={this.state.isOpen}
                disabled={disabled}
                position={Position.BOTTOM_LEFT}
                {...popoverProps}
                className={classNames(listProps.className, popoverProps.className)}
                onInteraction={this.handlePopoverInteraction}
                popoverClassName={classNames(Classes.SELECT_POPOVER, popoverProps.popoverClassName)}
                popoverWillOpen={this.handlePopoverWillOpen}
                popoverDidOpen={this.handlePopoverDidOpen}
                popoverWillClose={this.handlePopoverWillClose}
            >
                <div
                    onKeyDown={this.state.isOpen ? handleKeyDown : this.handleTargetKeyDown}
                    onKeyUp={this.state.isOpen ? handleKeyUp : undefined}
                >
                    {this.props.children}
                </div>
                <div onKeyDown={handleKeyDown} onKeyUp={handleKeyUp}>
                    {filterable ? input : undefined}
                    <Menu ulRef={listProps.itemsParentRef}>{this.renderItems(listProps)}</Menu>
                </div>
            </Popover>
        );
    };

    private renderItems({ items, renderItem }: IQueryListRendererProps<T>) {
        const { initialContent, noResults } = this.props;
        if (initialContent != null && this.isQueryEmpty()) {
            return initialContent;
        }
        const renderedItems = items.map(renderItem).filter(item => item != null);
        return renderedItems.length > 0 ? renderedItems : noResults;
    }

    private maybeRenderInputClearButton() {
        return !this.isQueryEmpty() ? (
            <Button className={CoreClasses.MINIMAL} icon="cross" onClick={this.resetQuery} />
        ) : (
            undefined
        );
    }

    private isQueryEmpty = () => this.state.query.length === 0;

    private handleActiveItemChange = (activeItem: T) => this.setState({ activeItem });

    private handleTargetKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
        // open popover when arrow key pressed on target while closed
        if (event.which === Keys.ARROW_UP || event.which === Keys.ARROW_DOWN) {
            this.setState({ isOpen: true });
        }
    };

    private handleItemSelect = (item: T, event: React.SyntheticEvent<HTMLElement>) => {
        this.setState({ isOpen: false });
        if (this.props.resetOnSelect) {
            this.resetQuery();
        }
        Utils.safeInvoke(this.props.onItemSelect, item, event);
    };

    private handlePopoverInteraction = (isOpen: boolean) => {
        this.setState({ isOpen });

        const { popoverProps = {} } = this.props;
        Utils.safeInvoke(popoverProps.onInteraction, isOpen);
    };

    private handlePopoverWillOpen = () => {
        const { popoverProps = {}, resetOnClose } = this.props;
        // save currently focused element before popover steals focus, so we can restore it when closing.
        this.previousFocusedElement = document.activeElement as HTMLElement;

        if (resetOnClose) {
            this.resetQuery();
        }

        Utils.safeInvoke(popoverProps.popoverWillOpen);
    };

    private handlePopoverDidOpen = () => {
        // scroll active item into view after popover transition completes and all dimensions are stable.
        if (this.list != null) {
            this.list.scrollActiveItemIntoView();
        }

        requestAnimationFrame(() => {
            const { inputProps = {} } = this.props;
            // autofocus is enabled by default
            if (inputProps.autoFocus !== false && this.input != null) {
                this.input.focus();
            }
        });

        const { popoverProps = {} } = this.props;
        Utils.safeInvoke(popoverProps.popoverDidOpen);
    };

    private handlePopoverWillClose = () => {
        // restore focus to saved element.
        // timeout allows popover to begin closing and remove focus handlers beforehand.
        requestAnimationFrame(() => {
            if (this.previousFocusedElement !== undefined) {
                this.previousFocusedElement.focus();
                this.previousFocusedElement = undefined;
            }
        });

        const { popoverProps = {} } = this.props;
        Utils.safeInvoke(popoverProps.popoverWillClose);
    };

    private handleQueryChange = (event: React.FormEvent<HTMLInputElement>) => {
        const { inputProps = {}, onQueryChange } = this.props;
        const query = event.currentTarget.value;
        this.setState({ query });
        Utils.safeInvoke(inputProps.onChange, event);
        Utils.safeInvoke(onQueryChange, query);
    };

    private resetQuery = () => {
        const { items, onQueryChange } = this.props;
        const query = "";
        this.setState({ activeItem: items[0], query });
        Utils.safeInvoke(onQueryChange, query);
    };
}
