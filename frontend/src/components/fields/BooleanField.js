import React, {Component} from 'react';
import './BooleanField.scss';
import {randomClassName} from "../../utils";

const classNames = require('classnames');

class BooleanField extends Component {

    constructor(props) {
        super(props);

        this.id = `field-${this.props.name || "noname"}-${randomClassName()}`;
    }

    render() {

        const checked = this.props.checked || false;
        const small = this.props.small || false;
        const name = this.props.name || null;
        const handler = () => {
            if (this.props.onChange) {
                this.props.onChange(!checked);
            }
        };

        return (
            <div className={classNames( "boolean-field", {"field-checked" : checked}, {"field-small": small})}>
                <div className="field-input">
                    <input type="checkbox" id={this.id} checked={checked} onChange={handler} />
                    <label htmlFor={this.id}>{(checked ? "✓ " : "✗ ") + name}</label>
                </div>
            </div>
        );
    }
}

export default BooleanField;
