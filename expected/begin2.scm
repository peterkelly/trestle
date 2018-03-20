(display
    "test"
    (lambda (v0)
        (display
            "\n"
            (lambda (v1)
                ((lambda (v2)
                        (SUCC v2))
                    3)))))
